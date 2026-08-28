import "./cryptoPolyfill";
import CryptoJS from "crypto-js";


//Translating Input to Bytes
function  ToBytes(wa){
  const {words, sigBytes} = wa;
  const out =  new Uint8Array(sigBytes);
  for(let i =0 ; i < sigBytes; i++){
    out[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff; //“move to right hand side and cut the bytes out”
  }
  return out;
}

const bytesOutput = (str) => ToBytes(CryptoJS.enc.Utf8.parse(str));

//Measure the Randomess 
export function SE(bytes){
  if(!bytes.length){
    return 0;
  }

  //Check whether the pass in data is empty or not
  const f = new Array(256).fill(0);
  for (const b of bytes){
    f[b]++;                     //take the user input then check on 256 bit which column the flagged
  }
    let H = 0;
  for (const c of f) 
    { 
      if (!c) continue; const p = c / bytes.length; H -= p * Math.log2(p); //calculate using the shannon mathematical formula
    }
  return H;
}

//check two input whether is the same use hamming (bitwise)
export function bitDifferent(a,b){
  const n = Math.min(a.length , b.length);
  if(!n){
    return 0;
  }
  let d = 0;
  for(let i= 0 ; i <n ; i++){
    let x = a[i] ^ b[i];
    while(x){
      d += x & 1;
      x >>= 1;
    }
  }
  return (d / (n * 8)) * 100;   // percentage of differing bits
}

const encBytes = (msg,pw) => ToBytes(CryptoJS.AES.encrypt(msg,pw).ciphertext);

function AvaFixed(msg,pw){
  const key = CryptoJS.SHA256(pw);
  const iv  = CryptoJS.enc.Hex.parse("00000000000000000000000000000000");
  return ToBytes(CryptoJS.AES.encrypt(msg, key, { iv, mode: CryptoJS.mode.CBC }).ciphertext);
}


export function analyze(message,password){
  const ptBytes = bytesOutput(message);
  const ctBytes = encBytes(message, password);
  
  const entropyMax = Math.log2(Math.min(ctBytes.length,256)) || 1;
  const entropyCipher = SE(ctBytes);
  
  const semantic = bitDifferent(ctBytes, encBytes(message,password));

  const last = password.length -1;
  const altPw = password.slice(0,last) + String.fromCharCode(password.charCodeAt(last) ^ 1);
  const avalanche = bitDifferent(AvaFixed(message,password), AvaFixed(message,altPw));

    return {
    plaintextLen: ptBytes.length,
    ciphertextLen: ctBytes.length,
    entropyPlain: SE(ptBytes),
    entropyCipher,
    entropyMax,
    pctOfMax: (entropyCipher / entropyMax) * 100,
    semantic,
    avalanche,
  };

}