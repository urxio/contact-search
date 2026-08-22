"use client"

import { FormEvent, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

export default function SetupPage(){
 const router=useRouter();const [available,setAvailable]=useState<boolean|null>(null);const [form,setForm]=useState({token:"",email:"",displayName:"",password:""});const [error,setError]=useState("");const [busy,setBusy]=useState(false)
 useEffect(()=>{fetch("/api/setup").then(r=>r.json()).then(d=>setAvailable(d.available)).catch(()=>setAvailable(false))},[])
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError("");const response=await fetch("/api/setup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});const data=await response.json();if(response.ok)router.replace("/workspaces");else setError(data.error||"Setup failed");setBusy(false)}
 if(available===null)return <main className="admin-shell min-h-screen" />
 if(!available)return <main className="admin-shell flex min-h-screen items-center justify-center px-4"><div className="admin-material max-w-sm rounded-3xl p-8"><h1 className="text-2xl font-bold">Setup complete</h1><p className="mt-2 text-sm text-muted-foreground">The platform owner has already been created.</p></div></main>
 return <main className="admin-shell flex min-h-screen items-center justify-center px-4"><section className="admin-material w-full max-w-md rounded-3xl p-8"><h1 className="text-2xl font-bold tracking-tight">Set up Name Search</h1><p className="mb-6 mt-1 text-sm text-muted-foreground">Create the first platform owner. This page permanently closes afterward.</p><form onSubmit={submit} className="space-y-4">
 {[["token","Setup token","password"],["displayName","Your name","text"],["email","Email","email"],["password","Password","password"]].map(([key,label,type])=><div key={key}><label className="mb-1.5 block text-sm font-medium" htmlFor={key}>{label}</label><input id={key} type={type} className="admin-field h-11 w-full rounded-xl px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" value={form[key as keyof typeof form]} onChange={e=>setForm({...form,[key]:e.target.value})} required /></div>)}
 {error&&<p className="text-sm text-destructive" role="alert">{error}</p>}<button disabled={busy} className="admin-primary-button h-11 w-full rounded-xl text-sm font-medium text-white disabled:opacity-50">{busy?"Creating owner…":"Create platform owner"}</button></form></section></main>
}
