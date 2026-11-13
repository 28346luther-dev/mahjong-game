// Return only known categories. Never expose raw provider errors, account
// records, request payloads or credentials through the public health endpoint.
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
