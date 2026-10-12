'use client';

import { useRouter } from 'next/router';

export default function Dashboard() {
  const router = useRouter();
  return (
    <div>
      <h1>Dashboard</h1>
      <button onClick={() => router.push('/')}>Go Home</button>
    </div>
  );
}
