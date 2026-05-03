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

  // Replace text-muted-foreground with text-on-surface-variant
  content = content.replace(/text-muted-foreground/g, 'text-on-surface-variant font-body');
  
  // page <main>
  content = content.replace(/<main className="([^"]+)">/, (match, classes) => {
    return `<main className="${classes.replace(/py-8/, 'pt-24 pb-16')} bg-surface">`;
  });

  // destructive to error
  content = content.replace(/bg-destructive\/10/g, 'bg-error-container');
  content = content.replace(/text-destructive/g, 'text-error font-body');

  // Cards
  content = content.replace(/<Card>/g, '<Card className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-outline-variant/15 p-6">');
  content = content.replace(/<Card key=\{([^}]+)\}>/g, '<Card key={$1} className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-outline-variant/15 p-6">');

  // CardTitle
  content = content.replace(/<CardTitle className="([^"]+)">/g, '<CardTitle className="$1 font-headline">');

  // Buttons
  content = content.replace(/<Button\s+type="submit"\s+disabled=\{([^}]+)\}\s+className="([^"]+)">/g, '<Button type="submit" disabled={$1} className="$2 bg-gradient-to-r from-primary to-primary-container text-on-primary rounded-md px-6 py-3 font-medium font-body hover:shadow-[0_4px_12px_rgba(0,81,96,0.2)] transition-all">');
  content = content.replace(/<Button\s+type="button"\s+variant="outline"\s+onClick=\{([^}]+)\}>/g, '<Button type="button" variant="outline" onClick={$1} className="bg-surface border border-outline-variant text-on-surface hover:bg-surface-container-low transition-colors rounded-md px-6 py-3 font-medium font-body">');
  content = content.replace(/<Button\s+type="button"\s+onClick=\{([^}]+)\}\s+className="([^"]+)">/g, '<Button type="button" onClick={$1} className="$2 bg-gradient-to-r from-primary to-primary-container text-on-primary rounded-md px-6 py-3 font-medium font-body hover:shadow-[0_4px_12px_rgba(0,81,96,0.2)] transition-all">');
  content = content.replace(/<Button\s+onClick=\{([^}]+)\}\s+disabled=\{([^}]+)\}>/g, '<Button onClick={$1} disabled={$2} className="bg-gradient-to-r from-primary to-primary-container text-on-primary rounded-md px-6 py-3 font-medium font-body hover:shadow-[0_4px_12px_rgba(0,81,96,0.2)] transition-all">');

  // Fix un-customized buttons
  content = content.replace(/<Button type="submit" disabled=\{isSubmitting\} className="w-full">/g, '<Button type="submit" disabled={isSubmitting} className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary rounded-md px-6 py-3 font-medium font-body hover:shadow-[0_4px_12px_rgba(0,81,96,0.2)] transition-all">');

  // Input
  content = content.replace(/className="mt-1"/g, 'className="mt-1 bg-surface-container-highest text-on-surface rounded-md py-2.5 px-4 border-none focus:ring-0 outline-none text-sm font-body focus:bg-surface-container-lowest focus:shadow-[0_0_0_1px_rgba(0,81,96,0.4)] transition-all w-full"');
  
  // Select
  content = content.replace(/<select\s+name="financingType"\s+required\s+className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"/g, '<select name="financingType" required className="mt-1 bg-surface-container-highest text-on-surface rounded-md py-2.5 px-4 border-none focus:ring-0 outline-none text-sm font-body focus:bg-surface-container-lowest focus:shadow-[0_0_0_1px_rgba(0,81,96,0.4)] transition-all w-full appearance-none cursor-pointer"');
  content = content.replace(/<select\s+name="rentalPeriod"\s+className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"/g, '<select name="rentalPeriod" className="mt-1 bg-surface-container-highest text-on-surface rounded-md py-2.5 px-4 border-none focus:ring-0 outline-none text-sm font-body focus:bg-surface-container-lowest focus:shadow-[0_0_0_1px_rgba(0,81,96,0.4)] transition-all w-full appearance-none cursor-pointer"');
  content = content.replace(/<select\s+\{\.\.\.register\("propertyType"\)\}\s+className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"/g, '<select {...register("propertyType")} className="mt-1 bg-surface-container-highest text-on-surface rounded-md py-2.5 px-4 border-none focus:ring-0 outline-none text-sm font-body focus:bg-surface-container-lowest focus:shadow-[0_0_0_1px_rgba(0,81,96,0.4)] transition-all w-full appearance-none cursor-pointer"');

  // Textarea
  content = content.replace(/<textarea([\s\S]*?)className="([^"]+)"/g, '<textarea$1className="$2 bg-surface-container-highest text-on-surface rounded-md py-2.5 px-4 border-none focus:ring-0 outline-none text-sm font-body focus:bg-surface-container-lowest focus:shadow-[0_0_0_1px_rgba(0,81,96,0.4)] transition-all w-full resize-none"');

  // Labels
  content = content.replace(/<label className="text-sm font-medium">/g, '<label className="text-sm font-medium font-headline">');

  // Step indicators
  content = content.replace(/bg-primary text-primary-foreground/g, 'bg-primary text-on-primary font-bold font-headline');
  content = content.replace(/bg-primary\/20 text-primary/g, 'bg-primary/20 text-primary font-bold font-headline');
  content = content.replace(/bg-muted text-muted-foreground/g, 'bg-surface-container text-on-surface-variant font-bold font-headline');

  // Radio cards
  content = content.replace(/border-primary bg-primary\/5/g, 'border-primary bg-primary/5 shadow-[0_0_0_1px_rgba(0,81,96,0.3)]');
  content = content.replace(/border-border hover:bg-accent/g, 'border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low');

  // Review section
  content = content.replace(/bg-muted p-4/g, 'bg-surface-container-low rounded-xl p-6 space-y-3 text-sm font-body');

  // Headings
  content = content.replace(/<h1 className="text-2xl font-bold">/g, '<h1 className="text-2xl font-bold font-headline">');
  content = content.replace(/<h3 className="font-semibold">/g, '<h3 className="font-semibold font-headline">');
  
  // Buyer/Tenant qual input
  content = content.replace(/<Input\s+placeholder="Paste document URL or file link"\s+value=\{urls\[doc\.type\] \|\| ""\}\s+onChange=\{\(e\) =>\s+setUrls\(\(prev\) => \(\{\s*\.\.\.prev,\s*\[doc\.type\]: e\.target\.value\s*\}\)\)\s+\}\s+\/>/g, '<Input placeholder="Paste document URL or file link" value={urls[doc.type] || ""} onChange={(e) => setUrls((prev) => ({ ...prev, [doc.type]: e.target.value })) } className="bg-surface-container-highest text-on-surface rounded-md py-2.5 px-4 border-none focus:ring-0 outline-none text-sm font-body focus:bg-surface-container-lowest focus:shadow-[0_0_0_1px_rgba(0,81,96,0.4)] transition-all w-full" />');

  // Secondary/10
  content = content.replace(/bg-secondary\/10/g, 'bg-surface-container-low border border-outline-variant/15');

  fs.writeFileSync(file, content);
});
