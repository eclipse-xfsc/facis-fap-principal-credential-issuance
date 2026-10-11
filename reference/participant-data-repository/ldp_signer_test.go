// SPDX-License-Identifier: Apache-2.0
package participant
import (
 "context"
 "crypto/ecdsa"
 "crypto/elliptic"
 "crypto/rand"
 "crypto/sha256"
 "encoding/base64"
 "encoding/json"
 "math/big"
 "os"
 "reflect"
 "strings"
 "testing"
 cp "github.com/eclipse-xfsc/crypto-provider-core/v2/types/proto"
 "google.golang.org/grpc"
)
type ldpCore struct{cp.CryptoProviderServiceClient; key *ecdsa.PrivateKey; calls int; request *cp.SignRequest}
func (f *ldpCore) Sign(_ context.Context,r *cp.SignRequest,_ ...grpc.CallOption)(*cp.SignResponse,error){
 f.calls++;f.request=r;hash:=sha256.Sum256(r.Data);signature,err:=ecdsa.SignASN1(rand.Reader,f.key,hash[:]);return &cp.SignResponse{Signature:signature},err
}
func TestLDPUsesCoreAndProtectsEveryClaim(t *testing.T){
 key,_:=ecdsa.GenerateKey(elliptic.P256(),rand.Reader);core:=&ldpCore{key:key};repo:=&Repository{Crypto:core,CryptoNamespace:"ocm",CryptoGroup:"alpha"}
 req:=RequestEnvelope{Subject:"alice",TenantID:"alpha",Issuer:"did:web:alpha.example.com",Status:map[string]any{"id":"https://alpha.example.com/status/1#0","type":"StatusList2021Entry","statusPurpose":"revocation","statusListIndex":"0","statusListCredential":"https://alpha.example.com/status/1"},HolderBinding:map[string]any{"jwk":map[string]any{"kty":"EC"}}}
 req.SigningContext.Origin="https://alpha.example.com";req.SigningContext.DID=req.Issuer;req.SigningContext.Key="issuer";req.SigningContext.Namespace="ocm";req.SigningContext.Group="alpha"
 conf:=Configuration{Identifier:"Employee",Format:"ldp_vc",KeyRef:"issuer",CredentialTypes:[]string{"VerifiableCredential","Employee"},Claims:[]ClaimDefinition{{Name:"issuer",Type:"string",Required:true},{Name:"type",Type:"string",Required:true}}}
 expected,err:=os.ReadFile("testdata/ldp-context.json");if err!=nil{t.Fatal(err)};var fromJS,fromGo any
 if err=json.Unmarshal(expected,&fromJS);err!=nil{t.Fatal(err)};encoded,_:=json.Marshal(ldpContext(conf,req.SigningContext.Origin));json.Unmarshal(encoded,&fromGo);if !reflect.DeepEqual(fromJS,fromGo){t.Fatal("JavaScript metadata and Go signing contexts differ")}
 signed,err:=repo.sign(context.Background(),req,conf,map[string]any{"issuer":"Synthetic issuer","type":"Synthetic type"});if err!=nil{t.Fatal(err)}
 if core.calls!=1||core.request.Identifier.Ctx.Namespace!="ocm"||core.request.Identifier.Ctx.Group!="alpha"||core.request.Identifier.KeyId!="issuer"{t.Fatal("Core signing scope differs")}
 var doc map[string]any;if err=json.Unmarshal([]byte(signed),&doc);err!=nil{t.Fatal(err)};proof:=doc["proof"].(map[string]any);jws:=strings.Split(proof["jws"].(string),".");if len(jws)!=3||jws[1]!=""{t.Fatal("not detached JWS")}
 delete(doc,"proof");delete(proof,"jws");proof["@context"]=doc["@context"]
 verify:=func()bool{ph,e:=canonicalHash(proof);if e!=nil{t.Fatal(e)};dh,e:=canonicalHash(doc);if e!=nil{t.Fatal(e)};input:=append([]byte(jws[0]+"."),ph[:]...);input=append(input,dh[:]...);hash:=sha256.Sum256(input);signature,_:=base64.RawURLEncoding.DecodeString(jws[2]);return ecdsa.Verify(&key.PublicKey,hash[:],new(big.Int).SetBytes(signature[:32]),new(big.Int).SetBytes(signature[32:]))}
 if !verify(){t.Fatal("signature does not verify")}
 claims:=doc["credentialSubject"].(map[string]any)["pciClaims"].(map[string]any)
 for _,name:=range []string{"issuer","type"}{old:=claims[name];claims[name]="tampered";if verify(){t.Fatal("claim absent from signed RDF graph",name)};claims[name]=old}
 proof["challenge"]="tampered";if verify(){t.Fatal("holder challenge unprotected")}
 if _,err=(fixedContextLoader{}).LoadDocument("https://untrusted.example/context");err==nil{t.Fatal("remote context accepted")}
}
