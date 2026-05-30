export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#05050F] flex items-center justify-center p-8 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full bg-rose-600/8 blur-[100px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-indigo-600/8 blur-[100px]" />
      </div>
      <div className="relative z-10 w-full">{children}</div>
    </div>
  );
}
