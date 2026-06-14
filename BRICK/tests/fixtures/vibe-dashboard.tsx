import { useState, useEffect } from "react";
import { LineChart } from "recharts";
import { Icon } from "lucide-react";

export function VibeDashboard() {
  // TODO: add real data
  const config: any = {};

  const [filter, setFilter] = useState("all");
  const [rows, setRows] = useState<string[]>([]);
  const [sort, setSort] = useState("asc");
  const [dead, setDead] = useState(false);

  useEffect(() => {
    setRows([]);
  }, []);

  useEffect(() => {
    setFilter("active");
  }, []);

  useEffect(() => {
    setSort("desc");
  }, []);

  useEffect(() => {
    console.log("mounted");
  }, []);

  return (
    <div className="p-4">
      <LineChart data={[]} isPremium={true} />
      <div onClick={() => setFilter("all")}>Reset</div>
      <img src="/chart.png" />
      <div className="-m-[20px] z-[9999]">Pulled layer</div>

      {[
        { name: "Operational clarity", value: 99 },
        { name: "Build faster with AI", value: 88 },
        { name: "Get started today", value: 77 },
      ].map((m) => (
        <div key={m.name} className="p-[17px]">
          <Icon name="chart" />
          <span className="text-[13px]">{m.name}</span>
        </div>
      ))}
    </div>
  );
}
