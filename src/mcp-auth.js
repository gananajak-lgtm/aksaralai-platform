// Explicit remote authorization is mandatory; browser cookies never authorize MCP.
export async function resolveMcpWriter(db,request,now,authenticateBearer) {
 const grant=await authenticateBearer(db,request.headers.get('authorization'),now);
 if(!grant||grant.scope!=='novels:read')return null;
 const writer=await db.prepare("SELECT id,role FROM users WHERE id=? AND role='writer'").bind(grant.user_id).first();
 return writer||null;
}
