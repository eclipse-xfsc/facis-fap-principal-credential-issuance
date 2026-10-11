// SPDX-License-Identifier: Apache-2.0
// Package credential defines the participant JWT VC and SD-JWT data formats.
// Signing is supplied by the caller; the package never owns a private key.
package credential

import (
 "context"
 "crypto/rand"
 "crypto/elliptic"
 "crypto/sha256"
 "encoding/asn1"
 "encoding/base64"
 "encoding/hex"
 "encoding/json"
 "errors"
 "math/big"
 "strings"
 "time"
)

type SignFunc func(context.Context, []byte) ([]byte, error)
type Context struct {
 Issuer, Subject string
 HolderBinding map[string]any
 Status map[string]any
}
type ClaimDefinition struct { Name string `json:"name"`; Type string `json:"type"`; Required bool `json:"required"` }
type Configuration struct {
 Identifier string `json:"identifier"`
 Format string `json:"format"`
 SigningMode string `json:"signingMode"`
 KeyRef string `json:"keyRef"`
 CredentialTypes []string `json:"credentialTypes"`
 VCT string `json:"vct"`
 Claims []ClaimDefinition `json:"claims"`
}
func b64(v any)string{b,_:=json.Marshal(v);return base64.RawURLEncoding.EncodeToString(b)}
func Encode(ctx context.Context,req Context,c Configuration,claims map[string]any,sign SignFunc)(string,error){
 if sign==nil || req.Issuer=="" || req.Subject=="" || c.KeyRef=="" || req.HolderBinding==nil || req.Status==nil{return "",errors.New("incomplete signing context")}
 id:=make([]byte,16);if _,err:=rand.Read(id);err!=nil{return "",err};id[6]=(id[6]&0x0f)|0x40;id[8]=(id[8]&0x3f)|0x80;credentialID:="urn:uuid:"+hex.EncodeToString(id[:4])+"-"+hex.EncodeToString(id[4:6])+"-"+hex.EncodeToString(id[6:8])+"-"+hex.EncodeToString(id[8:10])+"-"+hex.EncodeToString(id[10:]);now:=time.Now().UTC();exp:=now.Add(365*24*time.Hour)
 payload:=map[string]any{"iss":req.Issuer,"sub":req.Subject,"iat":now.Unix(),"nbf":now.Unix(),"exp":exp.Unix(),"jti":credentialID,"cnf":req.HolderBinding};typ:="JWT";disclosures:=[]string{}
 switch c.Format{
 case "jwt_vc_json":subject:=map[string]any{"id":req.Subject};for k,v:=range claims{subject[k]=v};payload["vc"]=map[string]any{"@context":[]string{"https://www.w3.org/2018/credentials/v1"},"id":credentialID,"type":c.CredentialTypes,"issuer":req.Issuer,"issuanceDate":now.Format(time.RFC3339),"expirationDate":exp.Format(time.RFC3339),"credentialSubject":subject,"credentialStatus":req.Status}
 case "vc+sd-jwt","dc+sd-jwt":typ=c.Format;payload["vct"]=c.VCT;payload["status"]=req.Status;payload["_sd_alg"]="sha-256";digests:=[]string{};for _,d:=range c.Claims{v,ok:=claims[d.Name];if !ok{continue};salt:=make([]byte,16);if _,err:=rand.Read(salt);err!=nil{return "",err};disclosure:=b64([]any{base64.RawURLEncoding.EncodeToString(salt),d.Name,v});sum:=sha256.Sum256([]byte(disclosure));digests=append(digests,base64.RawURLEncoding.EncodeToString(sum[:]));disclosures=append(disclosures,disclosure)};payload["_sd"]=digests
 default:return "",errors.New("unsupported credential format")
 }
 input:=b64(map[string]any{"alg":"ES256","typ":typ,"kid":req.Issuer+"#"+c.KeyRef})+"."+b64(payload)
 signature,err:=sign(ctx,[]byte(input))
 if err!=nil{return "",err}
 signature,err=NormalizeES256(signature);if err!=nil{return "",err}
 result:=input+"."+base64.RawURLEncoding.EncodeToString(signature);if typ!="JWT"{result+="~";if len(disclosures)>0{result+=strings.Join(disclosures,"~")+"~"}};return result,nil
}

// NormalizeES256 accepts Core DER or JOSE signatures and checks P-256 bounds.
func NormalizeES256(signature []byte)([]byte,error){
 if len(signature)!=64{var s struct{R,S *big.Int};rest,err:=asn1.Unmarshal(signature,&s);if err!=nil || len(rest)!=0 || s.R==nil || s.S==nil || s.R.Sign()<=0 || s.S.Sign()<=0 || s.R.BitLen()>256 || s.S.BitLen()>256{return nil,errors.New("invalid ES256 signature")};signature=make([]byte,64);s.R.FillBytes(signature[:32]);s.S.FillBytes(signature[32:])}
 r,s:=new(big.Int).SetBytes(signature[:32]),new(big.Int).SetBytes(signature[32:]);order:=elliptic.P256().Params().N
 if r.Sign()<=0 || s.Sign()<=0 || r.Cmp(order)>=0 || s.Cmp(order)>=0{return nil,errors.New("invalid ES256 signature")}
 return signature,nil
}
