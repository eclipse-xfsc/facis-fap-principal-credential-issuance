// SPDX-License-Identifier: Apache-2.0
package participant

import (
 "context"
 "crypto/rand"
 "crypto/sha256"
 "embed"
 "encoding/base64"
 "encoding/hex"
 "encoding/json"
 "errors"
 "net/url"
 "regexp"
 "strings"
 "time"

 credential "github.com/eclipse-xfsc/facis-fap-principal-credential-issuance/reference/participant-data-repository/credential"
 "github.com/piprate/json-gold/ld"
)

// No HTTP signer and no private key: every signature is supplied by Core gRPC.
//go:embed contexts/*.json
var contextFiles embed.FS

type fixedContextLoader struct{}
func (fixedContextLoader) LoadDocument(u string)(*ld.RemoteDocument,error){
 name:=map[string]string{"https://www.w3.org/2018/credentials/v1":"credentials-v1","https://w3id.org/security/suites/jws-2020/v1":"jws-2020-v1"}[u]
 if name==""{return nil,errors.New("unapproved JSON-LD remote context")}
 raw,err:=contextFiles.ReadFile("contexts/"+name+".json");if err!=nil{return nil,err};var doc any
 if err=json.Unmarshal(raw,&doc);err!=nil{return nil,err};return &ld.RemoteDocument{DocumentURL:u,Document:doc},nil
}
func component(s string)string{
 var b strings.Builder
 for _,v:=range []byte(s){if v>='a'&&v<='z'||v>='A'&&v<='Z'||v>='0'&&v<='9'||strings.ContainsRune("-_.!~*'()",rune(v)){b.WriteByte(v)}else{b.WriteByte('%');b.WriteString(strings.ToUpper(hex.EncodeToString([]byte{v})))}}
 return b.String()
}
func ldpContext(c Configuration,origin string)[]any{
 vocabulary:=strings.TrimRight(origin,"/")+"/.well-known/pci-vocabulary/"+component(c.Identifier)+"#";status:="https://w3id.org/vc/status-list#"
 claims:=map[string]any{};for _,d:=range c.Claims{claims[d.Name]=vocabulary+component(d.Name)}
 terms:=map[string]any{"pciClaims":map[string]any{"@id":vocabulary+"claims","@context":claims},"StatusList2021Entry":map[string]any{"@id":status+"StatusList2021Entry","@context":map[string]any{"@protected":true,"id":"@id","type":"@type","statusPurpose":status+"statusPurpose","statusListIndex":status+"statusListIndex","statusListCredential":map[string]any{"@id":status+"statusListCredential","@type":"@id"}}}}
 absolute:=regexp.MustCompile(`^[A-Za-z][A-Za-z0-9+.-]*:`)
 for _,kind:=range c.CredentialTypes{if kind!="VerifiableCredential"&&!absolute.MatchString(kind){terms[kind]=vocabulary+component(kind)}}
 return []any{"https://www.w3.org/2018/credentials/v1","https://w3id.org/security/suites/jws-2020/v1",terms}
}
func canonicalHash(document any)([32]byte,error){
 raw,err:=json.Marshal(document);if err!=nil{return [32]byte{},err};var input any;if err=json.Unmarshal(raw,&input);err!=nil{return [32]byte{},err}
 options:=ld.NewJsonLdOptions("");options.ProcessingMode="json-ld-1.1";options.Algorithm="URDNA2015";options.Format="application/n-quads";options.DocumentLoader=fixedContextLoader{}
 normalized,err:=ld.NewJsonLdProcessor().Normalize(input,options);if err!=nil{return [32]byte{},err};text,ok:=normalized.(string);if !ok||text==""{return [32]byte{},errors.New("empty linked-data graph")};return sha256.Sum256([]byte(text)),nil
}
func encodeLDP(ctx context.Context,req RequestEnvelope,c Configuration,claims map[string]any,sign credential.SignFunc)(string,error){
 origin,err:=url.Parse(req.SigningContext.Origin)
 if err!=nil||origin.Scheme!="https"||origin.Host==""||origin.User!=nil||origin.RawQuery!=""||origin.Fragment!=""||c.Format!="ldp_vc"||req.SigningContext.DID!=req.Issuer||req.SigningContext.Key!=c.KeyRef||req.Status==nil||req.HolderBinding==nil||sign==nil{return "",errors.New("linked-data signing binding mismatch")}
 random:=make([]byte,16);if _,err:=rand.Read(random);err!=nil{return "",err};random[6]=(random[6]&15)|64;random[8]=(random[8]&63)|128
 id:="urn:uuid:"+hex.EncodeToString(random[:4])+"-"+hex.EncodeToString(random[4:6])+"-"+hex.EncodeToString(random[6:8])+"-"+hex.EncodeToString(random[8:10])+"-"+hex.EncodeToString(random[10:])
 subject:=req.Subject;if !regexp.MustCompile(`^[A-Za-z][A-Za-z0-9+.-]*:[^\s]+$`).MatchString(subject){subject="urn:xfsc:pci:subject:"+component(subject)}
 now:=time.Now().UTC();contexts:=ldpContext(c,req.SigningContext.Origin)
 document:=map[string]any{"@context":contexts,"id":id,"type":c.CredentialTypes,"issuer":req.Issuer,"issuanceDate":now.Format(time.RFC3339),"expirationDate":now.Add(365*24*time.Hour).Format(time.RFC3339),"credentialSubject":map[string]any{"id":subject,"pciClaims":claims},"credentialStatus":req.Status}
 binding,err:=json.Marshal(req.HolderBinding);if err!=nil{return "",err};digest:=sha256.Sum256(binding)
 proof:=map[string]any{"@context":contexts,"type":"JsonWebSignature2020","created":now.Format(time.RFC3339),"verificationMethod":req.Issuer+"#"+c.KeyRef,"proofPurpose":"assertionMethod","challenge":hex.EncodeToString(digest[:])}
 proofHash,err:=canonicalHash(proof);if err!=nil{return "",err};documentHash,err:=canonicalHash(document);if err!=nil{return "",err}
 header:=base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"ES256","b64":false,"crit":["b64"]}`))
 input:=append([]byte(header+"."),proofHash[:]...);input=append(input,documentHash[:]...)
 signature,err:=sign(ctx,input);if err!=nil{return "",err};signature,err=credential.NormalizeES256(signature);if err!=nil{return "",err}
 delete(proof,"@context");proof["jws"]=header+".."+base64.RawURLEncoding.EncodeToString(signature);document["proof"]=proof
 raw,err:=json.Marshal(document);return string(raw),err
}
