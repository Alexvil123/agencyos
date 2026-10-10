// Standalone server-side diagnostics use Next's server-only empty entry point.
const Module=require('node:module');
const resolve=Module._resolveFilename;
Module._resolveFilename=function(request,parent,...rest){return resolve.call(this,request==='server-only'?'next/dist/compiled/server-only/empty':request,parent,...rest);};
require('@next/env').loadEnvConfig(process.cwd());
