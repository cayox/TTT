import { useEffect, useState } from 'react'

export function App() {
  const [msg, setMsg] = useState('…')
  useEffect(() => void window.api['app:ping']().then(setMsg), [])
  return <div className="p-10 text-lg">{msg}</div>
}
