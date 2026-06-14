import { useState } from "react";

export function AiLanding() {
  const [open, setOpen] = useState(false);

  return (
    <section
      className="bg-gradient-to-r from-indigo-600 to-purple-600 font-['Inter',sans-serif]"
      style={{ backgroundPosition: "center" }}
    >
      <div
        className="mx-auto max-w-7xl px-4 py-[70px]"
        style={{ position: "relative" }}
      >
        <h1 className="text-[42px] font-bold">Build faster with AI</h1>
        <p className="text-[15px] mt-[17px]">Operational clarity for your team.</p>

        <div className="mt-8 grid gap-[13px] grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-3xl bg-white/20 p-[30px] backdrop-blur-md"
            >
              <h3 className="text-xl font-semibold">Feature {i}</h3>
            </div>
          ))}
        </div>

        <button
          onClick={() => setOpen(true)}
          className="mt-6 bg-[#ff0055] px-[13px] py-2 text-white"
          style={{ cursor: "pointer" }}
        >
          Get started today
        </button>
      </div>
    </section>
  );
}
