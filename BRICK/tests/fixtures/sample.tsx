import { useState } from "react";

export function SloppyCard() {
  const [count, setCount] = useState(0);
  return (
    <div
      className="w-[123px] h-[45px] p-[13px] bg-[#ff0000]"
      style={{ marginTop: 10 }}
    >
      <button onClick={() => setCount(count + 1)}>Click</button>
    </div>
  );
}
