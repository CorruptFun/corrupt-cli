export default function ValueBanner() {
  return (
    <section className="border-y border-zinc-800 bg-black py-8">
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-left divide-y md:divide-y-0 md:divide-x divide-zinc-800">
        <div className="py-4 md:py-0 md:px-4">
          <h4 className="text-zinc-300 font-black uppercase text-xs tracking-widest mb-1">Guaranteed Approval</h4>
          <p className="text-sm text-zinc-400">Multiple financing paths. We work with banks, credit unions, and in-house terms.</p>
        </div>
        <div className="py-4 md:py-0 md:px-8">
          <h4 className="text-zinc-300 font-black uppercase text-xs tracking-widest mb-1">Custom Terms</h4>
          <p className="text-sm text-zinc-400">Drive away with budget-friendly financing options tailored specifically to your financial picture.</p>
        </div>
        <div className="py-4 md:py-0 md:px-8">
          <h4 className="text-zinc-300 font-black uppercase text-xs tracking-widest mb-1">Se Habla Español</h4>
          <p className="text-sm text-zinc-400">Nuestro equipo local está listo para ayudarte en tu propio idioma.</p>
        </div>
      </div>
    </section>
  );
}
