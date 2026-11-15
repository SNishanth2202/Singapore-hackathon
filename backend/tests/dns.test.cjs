const {test}=require('node:test');
const assert=require('node:assert/strict');
const {configureDns}=require('../dist/config/dns');
test('resolver configuration is optional and changes only the supplied process resolver',()=>{
 const calls=[];configureDns(undefined,x=>calls.push(x));configureDns(' ',x=>calls.push(x));assert.deepEqual(calls,[]);
 configureDns('192.0.2.1, 2001:db8::1',x=>calls.push(x));assert.deepEqual(calls,[['192.0.2.1','2001:db8::1']]);
 assert.throws(()=>configureDns('not-a-server',()=>{throw Error('must not apply')}),/DNS_SERVERS/);
});
