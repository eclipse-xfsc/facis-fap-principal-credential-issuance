// SPDX-License-Identifier: Apache-2.0
package participant

import (
 "context"
 "crypto"
 "crypto/rand"
 "crypto/rsa"
 "crypto/sha256"
 "encoding/base64"
 "encoding/json"
 "testing"
 "time"

 "github.com/lestrrat-go/jwx/v2/jwk"
 "google.golang.org/grpc/codes"
 "google.golang.org/grpc/status"
)

func fixture(t *testing.T)(*Repository,RequestEnvelope,*int){
 t.Helper();key,err:=rsa.GenerateKey(rand.Reader,2048);if err!=nil{t.Fatal(err)}
 public,err:=jwk.FromRaw(&key.PublicKey);if err!=nil{t.Fatal(err)};if err=public.Set(jwk.KeyIDKey,"test");err!=nil{t.Fatal(err)};if err=public.Set(jwk.AlgorithmKey,"RS256");err!=nil{t.Fatal(err)};keys:=jwk.NewSet();if err=keys.AddKey(public);err!=nil{t.Fatal(err)}
 encode:=func(v any)string{b,e:=json.Marshal(v);if e!=nil{t.Fatal(e)};return base64.RawURLEncoding.EncodeToString(b)}
 body:=encode(map[string]any{"alg":"RS256","kid":"test","typ":"JWT"})+"."+encode(map[string]any{"iss":"https://identity.example/realms/participant","sub":"alice","aud":"participant-data","exp":time.Now().Add(time.Hour).Unix(),"iat":time.Now().Unix(),"scp":"credential:issue"})
 sum:=sha256.Sum256([]byte(body));sig,err:=rsa.SignPKCS1v15(rand.Reader,key,crypto.SHA256,sum[:]);if err!=nil{t.Fatal(err)}
 configuration:=Configuration{Identifier:"Employee",Format:"jwt_vc_json",SigningMode:"internal-signing",KeyRef:"issuer",CredentialTypes:[]string{"VerifiableCredential","Employee"},Claims:[]ClaimDefinition{{Name:"name",Type:"string",Required:true}}};config,_:=json.Marshal(configuration)
 req:=RequestEnvelope{ProtocolVersion:"participant-v1",TenantID:"alpha",ConfigurationID:"employee",RequestID:"once",Subject:"hashed-alice",ParticipantSubject:"alice",ParticipantJWT:body+"."+base64.RawURLEncoding.EncodeToString(sig),Configuration:config,Issuer:"did:web:alpha.example",Deadline:time.Now().Add(20*time.Second),HolderBinding:map[string]any{"jwk":map[string]any{"kty":"EC"}}}
 req.SigningContext.Namespace="ocm-wstack";req.SigningContext.Group="alpha";req.SigningContext.Key="issuer";req.SigningContext.DID=req.Issuer
 calls:=new(int);r:=&Repository{TenantID:"alpha",CryptoNamespace:"ocm-wstack",CryptoGroup:"alpha",Issuer:"https://identity.example/realms/participant",Audience:"participant-data",Scopes:[]string{"credential:issue"},Keys:keys,Lookup:func(_ context.Context,tenant,configuration,subject string)(map[string]any,error){(*calls)++;if tenant!="alpha"||configuration!="employee"||subject!="alice"{t.Fatal("lookup escaped its binding")};return map[string]any{"name":"Alice","private":"never returned"},nil}}
 return r,req,calls
}
func bytesFor(t *testing.T,v any)[]byte{t.Helper();b,e:=json.Marshal(v);if e!=nil{t.Fatal(e)};return b}
func TestNotifyAndDataAreBoundAndConsumedOnce(t *testing.T){r,req,calls:=fixture(t);ctx:=context.Background();body:=bytesFor(t,req)
 if _,e:=r.GetCredentialData(ctx,body);status.Code(e)!=codes.FailedPrecondition{t.Fatal("missing Notify accepted",e)}
 if _,e:=r.Notify(ctx,body);e!=nil{t.Fatal(e)}
 req.Status=map[string]any{"index":1};out,e:=r.GetCredentialData(ctx,bytesFor(t,req));if e!=nil{t.Fatal(e)}
 var response map[string]any;if e=json.Unmarshal(out,&response);e!=nil{t.Fatal(e)};claims:=response["unsignedData"].(map[string]any)["claims"].(map[string]any);if len(claims)!=1||claims["name"]!="Alice"{t.Fatal("claim minimization failed")}
 if _,e=r.GetCredentialData(ctx,bytesFor(t,req));status.Code(e)!=codes.FailedPrecondition{t.Fatal("replay accepted",e)};if *calls!=1{t.Fatal("lookup was repeated")}
}
func TestChangedHolderCannotConsumeNotification(t *testing.T){r,req,calls:=fixture(t);ctx:=context.Background();if _,e:=r.Notify(ctx,bytesFor(t,req));e!=nil{t.Fatal(e)};req.HolderBinding=map[string]any{"jwk":"attacker"};if _,e:=r.GetCredentialData(ctx,bytesFor(t,req));status.Code(e)!=codes.FailedPrecondition{t.Fatal("changed holder accepted",e)};if *calls!=0{t.Fatal("data was read")}}
func TestInvalidTenantAndExpiredDeadlineFailBeforeLookup(t *testing.T){r,req,calls:=fixture(t);req.TenantID="beta";if _,e:=r.Notify(context.Background(),bytesFor(t,req));status.Code(e)!=codes.InvalidArgument{t.Fatal(e)};req.TenantID="alpha";req.Deadline=time.Now().Add(-time.Second);if _,e:=r.Notify(context.Background(),bytesFor(t,req));status.Code(e)!=codes.InvalidArgument{t.Fatal(e)};if *calls!=0{t.Fatal("data was read")}}
func TestEnvelopeRejectsTrailingJSONAndInvalidEncoding(t *testing.T){r,req,calls:=fixture(t);for _,body:=range [][]byte{append(bytesFor(t,req),[]byte(" {}")...),append(bytesFor(t,req),0xff)}{if _,e:=r.Notify(context.Background(),body);status.Code(e)!=codes.InvalidArgument{t.Fatal("invalid envelope accepted",e)}};if *calls!=0{t.Fatal("data was read")}}

func TestSigningContextCannotEscapeApprovedOCMGroup(t *testing.T){r,req,calls:=fixture(t);req.SigningContext.Group="beta";if _,e:=r.Notify(context.Background(),bytesFor(t,req));status.Code(e)!=codes.PermissionDenied{t.Fatal("wrong group accepted",e)};req.SigningContext.Group="alpha";req.SigningContext.Namespace="alpha";if _,e:=r.Notify(context.Background(),bytesFor(t,req));status.Code(e)!=codes.PermissionDenied{t.Fatal("wrong namespace accepted",e)};if *calls!=0{t.Fatal("data read")}}
