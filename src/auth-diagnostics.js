// Return known categories without account records or request payloads.
export function authDiagnostic(error){
 const message=String(error?.message||'').toLowerCase();
 if(/cpu time|cpu limit|exceeded.*cpu/.test(message))return {reason:'AUTH_CPU_LIMIT',message:'The account service exceeded its Cloudflare CPU limit.'};
 if(/free plan|paid plan|paid account|subscription/.test(message))return {reason:'AUTH_STORAGE_PLAN_REQUIRED',message:'Cloudflare reports that the account storage requires a different account plan or storage configuration.'};
 if(/quota|daily limit|account limit|request limit|storage limit|read limit|write limit|sqlite_full|disk is full/.test(message))return {reason:'AUTH_STORAGE_LIMIT_REACHED',message:'Cloudflare reports that an account-service quota has been reached.'};
 if(error?.overloaded||/overloaded|too many requests|too much load/.test(message))return {reason:'AUTH_STORAGE_BUSY',message:'Cloudflare reports that the account service is overloaded. Please try again shortly.'};
 if(/not exported|no such class|class.*not found|namespace.*not found|namespace.*does not exist|does not have.*class|cannot find.*namespace/.test(message))return {reason:'AUTH_BINDING_MISMATCH',message:'The AUTH Durable Object binding does not match the deployed account class or namespace.'};
 if(/migration|not registered|not enabled.*durable|durable.*not enabled/.test(message))return {reason:'AUTH_MIGRATION_REQUIRED',message:'Cloudflare reports an account Durable Object migration or provisioning problem.'};
 return {reason:'AUTH_STORAGE_UNAVAILABLE',message:'The account service could not complete your request. Please report the reference code.'};
}

// Only used for the credential-free storage health probe. Preserve the first
// provider error line while removing URLs, identities and credential-shaped data.
export function storageProbeDetail(error){
 const name=['Error','TypeError','RangeError','OperationError','NotSupportedError','SecurityError','NetworkError','DOMException'].includes(error?.name)?error.name:'Error';
 const message=String(error?.message||'No provider error message supplied')
  .split(/[\r\n]/,1)[0]
  .replace(/https?:\/\/[^\s)"']+/gi,'[URL]')
  .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[email]')
  .replace(/\bBearer\s+[^\s,;]+/gi,'Bearer [redacted]')
  .replace(/\b(password|token|secret|authorization|cookie|api[_-]?key)["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,'$1=[redacted]')
  .replace(/\b(?:secret|password|token)[-_][a-z0-9_-]+\b/gi,'[redacted]')
  .replace(/\b[a-z0-9_-]{32,}\b/gi,'[identifier]')
  .replace(/[\x00-\x1f\x7f]/g,' ')
  .slice(0,400);
 return {name,message,remote:error?.remote===true,retryable:error?.retryable===true,overloaded:error?.overloaded===true};
}
