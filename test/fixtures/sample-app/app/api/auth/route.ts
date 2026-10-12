import { cookies } from 'next/headers';

export function GET() {
  const cookieStore = cookies();
  const token = cookieStore.get('auth_token');
  return Response.json({ authenticated: !!token });
}
