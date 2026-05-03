const fs = require('fs');

const files = [
  "/Users/cheng/lusia/src/app/(marketplace)/listing/create/page.tsx",
  "/Users/cheng/lusia/src/app/(marketplace)/listing/[id]/offer/page.tsx",
  "/Users/cheng/lusia/src/app/(marketplace)/listing/[id]/apply/page.tsx",
  "/Users/cheng/lusia/src/app/(marketplace)/listing/[id]/contact/page.tsx",
  "/Users/cheng/lusia/src/app/(dashboard)/buyer/qualify/page.tsx",
  "/Users/cheng/lusia/src/app/(dashboard)/tenant/qualify/page.tsx"
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');

  // Button with class="ml-auto" inside step < STEPS.length
  content = content.replace(/<Button\s+type="submit"\s+disabled=\{([^}]+)\}\s+className="ml-auto"\s*>/g, '<Button type="submit" disabled={$1} className="ml-auto bg-gradient-to-r from-primary to-primary-container text-on-primary rounded-md px-6 py-3 font-medium font-body hover:shadow-[0_4px_12px_rgba(0,81,96,0.2)] transition-all">');

  // Checkboxes
  content = content.replace(/className="rounded border-border"/g, 'className="w-5 h-5 rounded border border-outline-variant text-primary focus:ring-primary bg-surface-container-lowest transition-colors"');

  // Muted foreground and backgrounds in listing create
  content = content.replace(/rounded-lg bg-surface-container-low rounded-xl p-6 space-y-3 text-sm font-body space-y-2 text-sm/g, 'bg-surface-container-low rounded-xl p-6 space-y-3 text-sm font-body');

  // <label className="flex items-center gap-2 text-sm font-medium">
  content = content.replace(/<label className="flex items-center gap-2 text-sm font-medium">/g, '<label className="flex items-center gap-2 text-sm font-medium font-headline">');

  // Apply page select
  content = content.replace(/<select\s+name="rentalPeriod"\s+className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"/g, '<select name="rentalPeriod" className="mt-1 bg-surface-container-highest text-on-surface rounded-md py-2.5 px-4 border-none focus:ring-0 outline-none text-sm font-body focus:bg-surface-container-lowest focus:shadow-[0_0_0_1px_rgba(0,81,96,0.4)] transition-all w-full appearance-none cursor-pointer"');

  fs.writeFileSync(file, content);
});
