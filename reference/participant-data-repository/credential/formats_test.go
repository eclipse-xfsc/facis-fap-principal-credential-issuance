// SPDX-License-Identifier: Apache-2.0
package credential

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"strings"
	"testing"
)

func TestJWTAndSDJWTUseTheSuppliedSignerAndPreserveBindings(t *testing.T) {
	key,err:=ecdsa.GenerateKey(elliptic.P256(),rand.Reader);if err!=nil{t.Fatal(err)}
	ctx:=Context{Issuer:"did:web:issuer.example",Subject:"principal",HolderBinding:map[string]any{"jwk":map[string]any{"kty":"EC"}},Status:map[string]any{"index":float64(7)}}
	for _,format:=range []string{"jwt_vc_json","dc+sd-jwt","vc+sd-jwt"}{
		calls:=0
		signed,err:=Encode(context.Background(),ctx,Configuration{Format:format,KeyRef:"issuer",VCT:"Employee",CredentialTypes:[]string{"VerifiableCredential","Employee"},Claims:[]ClaimDefinition{{Name:"name",Type:"string",Required:true}}},map[string]any{"name":"Synthetic Person"},func(_ context.Context,input []byte)([]byte,error){calls++;hash:=sha256.Sum256(input);return ecdsa.SignASN1(rand.Reader,key,hash[:])})
		if err!=nil || calls!=1{t.Fatal("signing failed",err,calls)}
		parts:=strings.Split(strings.Split(signed,"~")[0],".");if len(parts)!=3{t.Fatal("invalid JWT")}
		signature,err:=base64.RawURLEncoding.DecodeString(parts[2]);if err!=nil || len(signature)!=64{t.Fatal("invalid ES256 signature length")};digest:=sha256.Sum256([]byte(parts[0]+"."+parts[1]));if !ecdsa.Verify(&key.PublicKey,digest[:],new(big.Int).SetBytes(signature[:32]),new(big.Int).SetBytes(signature[32:])){t.Fatal("signature does not verify")}
        payload,err:=base64.RawURLEncoding.DecodeString(parts[1]);if err!=nil{t.Fatal(err)};var claims map[string]any;if json.Unmarshal(payload,&claims)!=nil{t.Fatal("invalid payload")}
		if claims["iss"]!=ctx.Issuer || claims["sub"]!=ctx.Subject || !strings.HasPrefix(claims["jti"].(string),"urn:uuid:"){t.Fatal("identity lost")}
		if format!="jwt_vc_json"{segments:=strings.Split(signed,"~");if len(segments)!=3 || segments[2]!=""{t.Fatal("invalid disclosure serialization")};hash:=sha256.Sum256([]byte(segments[1]));if claims["_sd"].([]any)[0]!=base64.RawURLEncoding.EncodeToString(hash[:]){t.Fatal("disclosure digest mismatch")};if _,exists:=claims["name"];exists{t.Fatal("selective claim exposed directly")}}
	}
}

func TestEmptyDisclosureSetHasExactlyOneSeparator(t *testing.T) {
 ctx:=Context{Issuer:"did:web:issuer.example",Subject:"principal",HolderBinding:map[string]any{"jwk":map[string]any{"kty":"EC"}},Status:map[string]any{"index":1}}
 signer:=func(context.Context,[]byte)([]byte,error){s:=make([]byte,64);s[31]=1;s[63]=1;return s,nil}
 result,err:=Encode(context.Background(),ctx,Configuration{Format:"dc+sd-jwt",KeyRef:"issuer",VCT:"Employee",Claims:[]ClaimDefinition{{Name:"optional",Type:"string"}}},map[string]any{},signer)
 if err!=nil{t.Fatal(err)}
 if strings.Count(result,"~")!=1 || !strings.HasSuffix(result,"~"){t.Fatal("invalid empty disclosure serialization")}
 if _,err=Encode(context.Background(),ctx,Configuration{Format:"jwt_vc_json",KeyRef:"issuer"},nil,func(context.Context,[]byte)([]byte,error){return make([]byte,64),nil});err==nil{t.Fatal("zero signature accepted")}
 if _,err=Encode(context.Background(),ctx,Configuration{Format:"jwt_vc_json",KeyRef:"issuer"},nil,nil);err==nil{t.Fatal("missing signer accepted")}
}
