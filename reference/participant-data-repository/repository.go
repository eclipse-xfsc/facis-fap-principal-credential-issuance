// SPDX-License-Identifier: Apache-2.0
package participant

import (
 "bytes"
 "context"
 "crypto/sha256"
 "encoding/json"
 "errors"
 "io"
 "strings"
 "sync"
 "time"
 "unicode/utf8"

 credential "github.com/eclipse-xfsc/facis-fap-principal-credential-issuance/reference/participant-data-repository/credential"
 cp "github.com/eclipse-xfsc/crypto-provider-core/v2/types/proto"
 "github.com/lestrrat-go/jwx/v2/jwk"
 "github.com/lestrrat-go/jwx/v2/jwt"
 "google.golang.org/grpc/codes"
 "google.golang.org/grpc/status"
)

type ClaimDefinition = credential.ClaimDefinition
type Configuration = credential.Configuration
type RequestEnvelope struct {
 ProtocolVersion string `json:"protocolVersion"`
 TenantID string `json:"tenantId"`
 ConfigurationID string `json:"configurationId"`
 RequestID string `json:"requestId"`
 Subject string `json:"subject"`
 ParticipantSubject string `json:"participantSubject"`
 ParticipantJWT string `json:"participantJwt"`
 Configuration json.RawMessage `json:"configuration"`
 Issuer string `json:"issuer"`
 HolderBinding map[string]any `json:"holderBinding"`
 Status map[string]any `json:"status"`
 Deadline time.Time `json:"deadline"`
 SigningContext struct { Namespace string `json:"namespace"`; Group string `json:"group"`; Key string `json:"key"`; DID string `json:"did"`; Origin string `json:"origin"` } `json:"signingContext"`
}
// Claims remain in the participant's own repository. PCI receives only the
// configured fields and does not persist the response. Production deployments
// replace Lookup with their own database query scoped by tenant and subject.
type Lookup func(context.Context,string,string,string)(map[string]any,error)
type Repository struct {
 TenantID,Issuer,Audience,CryptoNamespace,CryptoGroup string
 Scopes []string
 Keys jwk.Set
 Lookup Lookup
 Crypto cp.CryptoProviderServiceClient
 mu sync.Mutex
 notified map[string]notification
}
type notification struct { Expiry time.Time; Binding [32]byte }
func binding(req RequestEnvelope) [32]byte {
 // Status is allocated after Notify. Bind the principal, configuration and
 // holder before any participant record can be read.
 req.Status=nil
 encoded,_:=json.Marshal(req)
 return sha256.Sum256(encoded)
}
func (r *Repository) decode(ctx context.Context,body []byte)(RequestEnvelope,Configuration,error){
 var req RequestEnvelope;var conf Configuration
 if len(body)>1048576{return req,conf,status.Error(codes.ResourceExhausted,"request too large")}
 if !utf8.Valid(body){return req,conf,status.Error(codes.InvalidArgument,"invalid request encoding")}
 dec:=json.NewDecoder(bytes.NewReader(body));dec.DisallowUnknownFields()
 if dec.Decode(&req)!=nil || req.ProtocolVersion!="participant-v1" || req.TenantID!=r.TenantID || req.RequestID=="" || req.ConfigurationID=="" || req.Subject=="" || !req.Deadline.After(time.Now()) || req.Deadline.After(time.Now().Add(30*time.Second)){return req,conf,status.Error(codes.InvalidArgument,"invalid request binding")}
 var trailing any;if dec.Decode(&trailing)!=io.EOF{return req,conf,status.Error(codes.InvalidArgument,"invalid request envelope")}
 if json.Unmarshal(req.Configuration,&conf)!=nil{return req,conf,status.Error(codes.InvalidArgument,"invalid configuration")}
 if conf.SigningMode!="internal-signing" && conf.SigningMode!="participant-signed"{return req,conf,status.Error(codes.InvalidArgument,"invalid signing mode")}
 token,err:=jwt.Parse([]byte(req.ParticipantJWT),jwt.WithKeySet(r.Keys),jwt.WithValidate(true),jwt.WithIssuer(r.Issuer),jwt.WithAudience(r.Audience))
 if err!=nil || token.Subject()!=req.ParticipantSubject || token.Expiration().Before(time.Now()){return req,conf,status.Error(codes.Unauthenticated,"participant identity rejected")}
 raw,ok:=token.Get("scope");if !ok{raw,_=token.Get("scp")};scope,_:=raw.(string);for _,required:=range r.Scopes{found:=false;for _,s:=range strings.Fields(scope){if s==required{found=true}};if !found{return req,conf,status.Error(codes.PermissionDenied,"required scope absent")}}
 if req.SigningContext.Namespace!=r.CryptoNamespace || req.SigningContext.Key!=conf.KeyRef || req.SigningContext.Group!=r.CryptoGroup || req.SigningContext.DID!=req.Issuer{return req,conf,status.Error(codes.PermissionDenied,"signing context rejected")}
 return req,conf,nil
}
func (r *Repository) Notify(ctx context.Context,body []byte)([]byte,error){
 req,_,err:=r.decode(ctx,body);if err!=nil{return nil,err}
 r.mu.Lock();defer r.mu.Unlock();if r.notified==nil{r.notified=make(map[string]notification)};for id,notice:=range r.notified{if !notice.Expiry.After(time.Now()){delete(r.notified,id)}}
 if len(r.notified)>=1000{return nil,status.Error(codes.ResourceExhausted,"capacity reached")}
 digest:=binding(req)
 if old,exists:=r.notified[req.RequestID];exists && old.Binding!=digest{return nil,status.Error(codes.PermissionDenied,"notification binding changed")}
 r.notified[req.RequestID]=notification{Expiry:req.Deadline,Binding:digest}
 return json.Marshal(map[string]any{"requestId":req.RequestID,"accepted":true})
}
func (r *Repository) GetCredentialData(ctx context.Context,body []byte)([]byte,error){
 req,conf,err:=r.decode(ctx,body);if err!=nil{return nil,err}
 r.mu.Lock();notice,ok:=r.notified[req.RequestID];delete(r.notified,req.RequestID);r.mu.Unlock()
 if !ok || !notice.Expiry.After(time.Now()) || notice.Binding!=binding(req){return nil,status.Error(codes.FailedPrecondition,"notify first; requests are consumed once")}
 ctx,cancel:=context.WithDeadline(ctx,req.Deadline);defer cancel()
 values,err:=r.Lookup(ctx,req.TenantID,req.ConfigurationID,req.ParticipantSubject);if err!=nil{return nil,status.Error(codes.NotFound,"participant record unavailable")}
 claims:=make(map[string]any)
 for _,d:=range conf.Claims{v,exists:=values[d.Name];if !exists{if d.Required{return nil,status.Error(codes.FailedPrecondition,"required claim absent")};continue};valid:=false;switch d.Type{case "string":s,ok:=v.(string);valid=ok&&len(s)<=2000;case "boolean":_,valid=v.(bool);case "number":_,valid=v.(float64)};if !valid{return nil,status.Error(codes.FailedPrecondition,"claim type mismatch")};claims[d.Name]=v}
 if conf.SigningMode=="internal-signing"{return json.Marshal(map[string]any{"requestId":req.RequestID,"unsignedData":map[string]any{"subject":req.Subject,"claims":claims}})}
 if r.Crypto==nil || req.Status==nil || req.HolderBinding==nil{return nil,status.Error(codes.FailedPrecondition,"signer, status and holder are required")}
 signed,err:=r.sign(ctx,req,conf,claims);if err!=nil{return nil,status.Error(codes.Internal,"credential signing failed")}
 return json.Marshal(map[string]any{"requestId":req.RequestID,"signedCredential":signed})
}
func (r *Repository) sign(ctx context.Context,req RequestEnvelope,c Configuration,claims map[string]any)(string,error){
 signer:=func(ctx context.Context,input []byte)([]byte,error){
  reply,err:=r.Crypto.Sign(ctx,&cp.SignRequest{Identifier:&cp.CryptoIdentifier{KeyId:c.KeyRef,Ctx:&cp.CryptoContext{Namespace:r.CryptoNamespace,Group:r.CryptoGroup,Engine:"transit"}},Data:input})
  if err!=nil{return nil,err};if reply==nil{return nil,errors.New("signer returned no result")};return reply.Signature,nil
 }
 if c.Format=="ldp_vc"{return encodeLDP(ctx,req,c,claims,signer)}
 return credential.Encode(ctx,credential.Context{Issuer:req.Issuer,Subject:req.Subject,HolderBinding:req.HolderBinding,Status:req.Status},c,claims,signer)
}
