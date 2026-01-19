export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/50">
      <div className="absolute inset-0 bg-grid-pattern opacity-[0.02] pointer-events-none" />
      {children}
    </div>
  );
}
