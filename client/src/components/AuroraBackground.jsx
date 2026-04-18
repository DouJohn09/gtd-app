export default function AuroraBackground() {
  return (
    <>
      <div
        className="fixed inset-0 z-0 pointer-events-none animate-breathe"
        style={{
          background: `
            radial-gradient(ellipse at 18% 12%, rgba(167,139,250,0.32), transparent 55%),
            radial-gradient(ellipse at 82% 8%, rgba(94,234,212,0.22), transparent 55%),
            radial-gradient(ellipse at 65% 88%, rgba(251,191,36,0.16), transparent 55%),
            radial-gradient(ellipse at 8% 78%, rgba(251,113,133,0.12), transparent 60%)
          `,
        }}
      />
      <div
        className="fixed inset-0 z-0 pointer-events-none opacity-[0.025] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </>
  );
}
