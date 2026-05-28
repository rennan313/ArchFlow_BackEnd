export default function Home() {
  return (
    <main style={{ fontFamily: "monospace", padding: "2rem" }}>
      <h1>ArchFlow API</h1>
      <p>Backend is running. Use the API endpoints to interact with the system.</p>
      <ul>
        <li>POST /api/auth/register</li>
        <li>POST /api/auth/login</li>
        <li>POST /api/auth/refresh</li>
        <li>POST /api/auth/forgot-password</li>
        <li>POST /api/auth/reset-password</li>
        <li>GET /api/auth/me</li>
        <li>GET /api/proposals</li>
        <li>POST /api/proposals</li>
        <li>GET /api/proposals/:id</li>
        <li>PUT /api/proposals/:id</li>
        <li>DELETE /api/proposals/:id</li>
        <li>GET /api/instances</li>
        <li>GET /api/instances/:id</li>
        <li>GET /api/instances/:id/metrics</li>
      </ul>
    </main>
  );
}
