const fs = require('fs');

const buyerContent = `import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VerificationStatusChip } from "@/components/trust/verification-status-chip";

export const dynamic = "force-dynamic";

export default async function BuyerDashboardPage() {
  const { userId } = await auth();
  if (!userId) {
    notFound();
  }

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!user) {
    notFound();
  }

  const offers = await db.offer.findMany({
    where: { buyerId: user.id },
    include: {
      listing: {
        include: { property: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const documents = await db.document.findMany({
    where: { ownerUserId: user.id },
  });

  const hasId = documents.some((d) => d.documentType === "ID");
  const hasProofOfFunds = documents.some((d) => d.documentType === "PROOF_OF_FUNDS");
  const hasNif = documents.some((d) => d.documentType === "NIF");

  return (
    <main className="mx-auto max-w-5xl px-4 bg-surface pt-24 pb-16">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold font-headline text-on-surface mb-2">Buyer Dashboard</h1>
          <p className="mt-2 text-on-surface-variant font-body">
            Track your offers, saved listings, and qualification status.
          </p>
        </div>
        <Link href="/buyer/qualify">
          <button className="bg-surface border border-outline-variant text-on-surface hover:bg-surface-container-low transition-colors rounded-md px-5 py-2.5 font-medium font-body">
            Qualify as Buyer
          </button>
        </Link>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-outline-variant/15 p-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined text-on-surface-variant">request_page</span>
            <h3 className="text-sm font-medium text-on-surface-variant font-headline">Offers Made</h3>
          </div>
          <p className="text-3xl font-bold font-body text-on-surface">{offers.length}</p>
        </div>
        <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-outline-variant/15 p-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined text-on-surface-variant">folder_open</span>
            <h3 className="text-sm font-medium text-on-surface-variant font-headline">Documents</h3>
          </div>
          <p className="text-3xl font-bold font-body text-on-surface">{documents.length}</p>
        </div>
        <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-outline-variant/15 p-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined text-on-surface-variant">verified_user</span>
            <h3 className="text-sm font-medium text-on-surface-variant font-headline">Qualification</h3>
          </div>
          <p className="text-3xl font-bold font-body text-on-surface">
            {hasId && hasNif ? "Ready" : "Incomplete"}
          </p>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-bold font-headline text-on-surface mb-4">Your Offers</h2>
        {offers.length === 0 ? (
          <div className="bg-surface-container-low rounded-xl py-16 text-center border border-outline-variant/15">
            <p className="text-sm text-on-surface-variant font-body">
              No offers yet.{" "}
              <Link href="/listings" className="text-primary hover:text-primary-container font-medium transition-colors">
                Browse listings
              </Link>{" "}
              to make your first offer.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {offers.map((offer) => (
              <div key={offer.id} className="flex items-center justify-between bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/15 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,81,96,0.04)] transition-all">
                <div>
                  <p className="font-medium font-body text-on-surface">
                    €{offer.price.toLocaleString()} —{" "}
                    {offer.listing.property.addressLine}
                  </p>
                  <p className="text-sm text-on-surface-variant font-body mt-1">
                    {offer.financingType} · Submitted{" "}
                    {new Date(offer.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <VerificationStatusChip
                  status={
                    offer.status === "ACCEPTED"
                      ? "verified"
                      : offer.status === "DECLINED"
                        ? "rejected"
                        : "pending"
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {(!hasId || !hasNif) && (
        <div className="mt-8 bg-secondary-container/30 rounded-xl p-6 border border-secondary/20">
          <p className="text-sm text-on-secondary-container font-body mb-4">
            <strong>Complete your buyer qualification</strong> to show sellers
            you are serious. Missing:{" "}
            {!hasId && "ID Document"}
            {!hasId && !hasNif && ", "}
            {!hasNif && "NIF"}
          </p>
          <Link href="/buyer/qualify">
            <button className="bg-surface border border-outline-variant text-on-surface hover:bg-surface-container-low transition-colors rounded-md px-5 py-2.5 font-medium font-body text-sm">
              Qualify Now
            </button>
          </Link>
        </div>
      )}
    </main>
  );
}
`;

const sellerContent = `import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VerificationStatusChip } from "@/components/trust/verification-status-chip";

export const dynamic = "force-dynamic";

export default async function SellerDashboardPage() {
  const { userId } = await auth();
  if (!userId) {
    notFound();
  }

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!user) {
    notFound();
  }

  const listings = await db.listing.findMany({
    where: { listedByUserId: user.id, listingType: "SALE" },
    include: { property: true },
    orderBy: { createdAt: "desc" },
  });

  const listingIds = listings.map((l) => l.id);

  const offers = await db.offer.findMany({
    where: { listingId: { in: listingIds } },
    include: {
      buyer: true,
      listing: { include: { property: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const pendingOffers = offers.filter((o) => o.status === "SUBMITTED");

  return (
    <main className="mx-auto max-w-5xl px-4 bg-surface pt-24 pb-16">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold font-headline text-on-surface mb-2">Seller Dashboard</h1>
          <p className="mt-2 text-on-surface-variant font-body">
            Manage your sale listings and review offers.
          </p>
        </div>
        <Link href="/listing/create">
          <button className="bg-gradient-to-r from-primary to-primary-container text-on-primary rounded-md px-5 py-2.5 font-medium font-body hover:shadow-[0_4px_12px_rgba(0,81,96,0.2)] transition-all">
            New Listing
          </button>
        </Link>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-outline-variant/15 p-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined text-on-surface-variant">home_work</span>
            <h3 className="text-sm font-medium text-on-surface-variant font-headline">Listings</h3>
          </div>
          <p className="text-3xl font-bold font-body text-on-surface">{listings.length}</p>
        </div>
        <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-outline-variant/15 p-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined text-on-surface-variant">mark_email_unread</span>
            <h3 className="text-sm font-medium text-on-surface-variant font-headline">Pending Offers</h3>
          </div>
          <p className="text-3xl font-bold font-body text-on-surface">{pendingOffers.length}</p>
        </div>
        <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-outline-variant/15 p-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined text-on-surface-variant">receipt_long</span>
            <h3 className="text-sm font-medium text-on-surface-variant font-headline">Total Offers</h3>
          </div>
          <p className="text-3xl font-bold font-body text-on-surface">{offers.length}</p>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-bold font-headline text-on-surface mb-4">Your Listings</h2>
        {listings.length === 0 ? (
          <div className="bg-surface-container-low rounded-xl py-16 text-center border border-outline-variant/15">
            <p className="text-sm text-on-surface-variant font-body">
              No listings yet.{" "}
              <Link href="/listing/create" className="text-primary hover:text-primary-container font-medium transition-colors">
                Create your first listing
              </Link>
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {listings.map((listing) => (
              <div
                key={listing.id}
                className="flex items-center justify-between bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/15 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,81,96,0.04)] transition-all"
              >
                <div>
                  <p className="font-medium font-body text-on-surface">
                    {listing.property.addressLine || "Unnamed property"}
                  </p>
                  <p className="text-sm text-on-surface-variant font-body mt-1">
                    {listing.property.district} — €
                    {listing.price.toLocaleString()}
                  </p>
                </div>
                <VerificationStatusChip
                  status={
                    listing.status === "PUBLISHED"
                      ? "verified"
                      : "pending"
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-bold font-headline text-on-surface mb-4">Offers Received</h2>
        {offers.length === 0 ? (
          <div className="bg-surface-container-low rounded-xl py-16 text-center border border-outline-variant/15">
            <p className="text-sm text-on-surface-variant font-body">
              No offers yet. Offers will appear here when buyers submit them.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {offers.map((offer) => (
              <div key={offer.id} className="flex items-center justify-between bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/15 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,81,96,0.04)] transition-all">
                <div>
                  <p className="font-medium font-body text-on-surface">
                    €{offer.price.toLocaleString()} —{" "}
                    {offer.listing.property.addressLine}
                  </p>
                  <p className="text-sm text-on-surface-variant font-body mt-1">
                    From {offer.buyer.name || offer.buyer.email} ·{" "}
                    {offer.financingType}
                  </p>
                  {offer.conditions && (
                    <p className="mt-1 text-sm italic text-on-surface-variant font-body">
                      &ldquo;{offer.conditions}&rdquo;
                    </p>
                  )}
                </div>
                <VerificationStatusChip
                  status={
                    offer.status === "ACCEPTED"
                      ? "verified"
                      : offer.status === "DECLINED"
                        ? "rejected"
                        : "pending"
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
`;

const landlordContent = `import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VerificationStatusChip } from "@/components/trust/verification-status-chip";

export const dynamic = "force-dynamic";

export default async function LandlordDashboardPage() {
  const { userId } = await auth();
  if (!userId) {
    notFound();
  }

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!user) {
    notFound();
  }

  const listings = await db.listing.findMany({
    where: { listedByUserId: user.id, listingType: "RENT" },
    include: { property: true },
    orderBy: { createdAt: "desc" },
  });

  const listingIds = listings.map((l) => l.id);

  const applications = await db.rentalApplication.findMany({
    where: { listingId: { in: listingIds } },
    include: {
      tenant: true,
      listing: { include: { property: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const pendingApplications = applications.filter(
    (a) => a.status === "SUBMITTED"
  );

  return (
    <main className="mx-auto max-w-5xl px-4 bg-surface pt-24 pb-16">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold font-headline text-on-surface mb-2">Landlord Dashboard</h1>
          <p className="mt-2 text-on-surface-variant font-body">
            Manage your rental listings and review applications.
          </p>
        </div>
        <Link href="/listing/create">
          <button className="bg-gradient-to-r from-primary to-primary-container text-on-primary rounded-md px-5 py-2.5 font-medium font-body hover:shadow-[0_4px_12px_rgba(0,81,96,0.2)] transition-all">
            New Listing
          </button>
        </Link>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-outline-variant/15 p-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined text-on-surface-variant">home_work</span>
            <h3 className="text-sm font-medium text-on-surface-variant font-headline">Listings</h3>
          </div>
          <p className="text-3xl font-bold font-body text-on-surface">{listings.length}</p>
        </div>
        <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-outline-variant/15 p-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined text-on-surface-variant">mark_email_unread</span>
            <h3 className="text-sm font-medium text-on-surface-variant font-headline">Pending Applications</h3>
          </div>
          <p className="text-3xl font-bold font-body text-on-surface">{pendingApplications.length}</p>
        </div>
        <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-outline-variant/15 p-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined text-on-surface-variant">assignment</span>
            <h3 className="text-sm font-medium text-on-surface-variant font-headline">Total Applications</h3>
          </div>
          <p className="text-3xl font-bold font-body text-on-surface">{applications.length}</p>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-bold font-headline text-on-surface mb-4">Your Listings</h2>
        {listings.length === 0 ? (
          <div className="bg-surface-container-low rounded-xl py-16 text-center border border-outline-variant/15">
            <p className="text-sm text-on-surface-variant font-body">
              No listings yet.{" "}
              <Link href="/listing/create" className="text-primary hover:text-primary-container font-medium transition-colors">
                Create your first listing
              </Link>
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {listings.map((listing) => (
              <div
                key={listing.id}
                className="flex items-center justify-between bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/15 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,81,96,0.04)] transition-all"
              >
                <div>
                  <p className="font-medium font-body text-on-surface">
                    {listing.property.addressLine || "Unnamed property"}
                  </p>
                  <p className="text-sm text-on-surface-variant font-body mt-1">
                    {listing.property.district} — €
                    {listing.price.toLocaleString()}/month
                  </p>
                </div>
                <VerificationStatusChip
                  status={
                    listing.status === "PUBLISHED"
                      ? "verified"
                      : "pending"
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-bold font-headline text-on-surface mb-4">Applications Received</h2>
        {applications.length === 0 ? (
          <div className="bg-surface-container-low rounded-xl py-16 text-center border border-outline-variant/15">
            <p className="text-sm text-on-surface-variant font-body">
              No applications yet. Applications will appear here when tenants submit them.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {applications.map((app) => (
              <div key={app.id} className="flex items-center justify-between bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/15 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,81,96,0.04)] transition-all">
                <div>
                  <p className="font-medium font-body text-on-surface">
                    {app.tenant.name || app.tenant.email} —{" "}
                    {app.listing.property.addressLine}
                  </p>
                  <p className="text-sm text-on-surface-variant font-body mt-1">
                    Submitted{" "}
                    {new Date(app.createdAt).toLocaleDateString()}
                    {app.moveInDate && (
                      <> · Move-in: {new Date(app.moveInDate).toLocaleDateString()}</>
                    )}
                    {app.rentalPeriod && (
                      <> · Period: {app.rentalPeriod}</>
                    )}
                  </p>
                </div>
                <VerificationStatusChip
                  status={
                    app.status === "ACCEPTED"
                      ? "verified"
                      : app.status === "DECLINED"
                        ? "rejected"
                        : "pending"
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
`;

const tenantContent = `import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VerificationStatusChip } from "@/components/trust/verification-status-chip";

export const dynamic = "force-dynamic";

export default async function TenantDashboardPage() {
  const { userId } = await auth();
  if (!userId) {
    notFound();
  }

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!user) {
    notFound();
  }

  const applications = await db.rentalApplication.findMany({
    where: { tenantId: user.id },
    include: {
      listing: {
        include: { property: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const documents = await db.document.findMany({
    where: { ownerUserId: user.id },
  });

  const hasId = documents.some((d) => d.documentType === "ID");
  const hasProofOfIncome = documents.some((d) => d.documentType === "PROOF_OF_INCOME");

  return (
    <main className="mx-auto max-w-5xl px-4 bg-surface pt-24 pb-16">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold font-headline text-on-surface mb-2">Tenant Dashboard</h1>
          <p className="mt-2 text-on-surface-variant font-body">
            Track your rental applications and qualification status.
          </p>
        </div>
        <Link href="/tenant/qualify">
          <button className="bg-surface border border-outline-variant text-on-surface hover:bg-surface-container-low transition-colors rounded-md px-5 py-2.5 font-medium font-body">
            Qualify as Tenant
          </button>
        </Link>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-outline-variant/15 p-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined text-on-surface-variant">assignment</span>
            <h3 className="text-sm font-medium text-on-surface-variant font-headline">Applications</h3>
          </div>
          <p className="text-3xl font-bold font-body text-on-surface">{applications.length}</p>
        </div>
        <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-outline-variant/15 p-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined text-on-surface-variant">folder_open</span>
            <h3 className="text-sm font-medium text-on-surface-variant font-headline">Documents</h3>
          </div>
          <p className="text-3xl font-bold font-body text-on-surface">{documents.length}</p>
        </div>
        <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-outline-variant/15 p-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined text-on-surface-variant">verified_user</span>
            <h3 className="text-sm font-medium text-on-surface-variant font-headline">Qualification</h3>
          </div>
          <p className="text-3xl font-bold font-body text-on-surface">
            {hasId && hasProofOfIncome ? "Ready" : "Incomplete"}
          </p>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-bold font-headline text-on-surface mb-4">Your Applications</h2>
        {applications.length === 0 ? (
          <div className="bg-surface-container-low rounded-xl py-16 text-center border border-outline-variant/15">
            <p className="text-sm text-on-surface-variant font-body">
              No applications yet.{" "}
              <Link href="/listings" className="text-primary hover:text-primary-container font-medium transition-colors">
                Browse rentals
              </Link>{" "}
              to apply.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {applications.map((app) => (
              <div key={app.id} className="flex items-center justify-between bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/15 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,81,96,0.04)] transition-all">
                <div>
                  <p className="font-medium font-body text-on-surface">
                    {app.listing.property.addressLine}
                  </p>
                  <p className="text-sm text-on-surface-variant font-body mt-1">
                    Submitted {new Date(app.createdAt).toLocaleDateString()}
                    {app.moveInDate && (
                      <> · Move-in: {new Date(app.moveInDate).toLocaleDateString()}</>
                    )}
                  </p>
                </div>
                <VerificationStatusChip
                  status={
                    app.status === "ACCEPTED"
                      ? "verified"
                      : app.status === "DECLINED"
                        ? "rejected"
                        : "pending"
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {(!hasId || !hasProofOfIncome) && (
        <div className="mt-8 bg-secondary-container/30 rounded-xl p-6 border border-secondary/20">
          <p className="text-sm text-on-secondary-container font-body mb-4">
            <strong>Complete your tenant qualification</strong> to show
            landlords you are reliable. Missing:{" "}
            {!hasId && "ID Document"}
            {!hasId && !hasProofOfIncome && ", "}
            {!hasProofOfIncome && "Proof of Income"}
          </p>
          <Link href="/tenant/qualify">
            <button className="bg-surface border border-outline-variant text-on-surface hover:bg-surface-container-low transition-colors rounded-md px-5 py-2.5 font-medium font-body text-sm">
              Qualify Now
            </button>
          </Link>
        </div>
      )}
    </main>
  );
}
`;

const settingsContent = `import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { VerificationStatusChip } from "@/components/trust/verification-status-chip";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { userId } = await auth();
  if (!userId) {
    notFound();
  }

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!user) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-2xl px-4 bg-surface pt-24 pb-16">
      <h1 className="text-2xl font-bold font-headline text-on-surface mb-2">Settings</h1>
      <p className="mt-2 text-on-surface-variant font-body">
        Manage your profile and account settings.
      </p>

      <div className="mt-8 space-y-6">
        <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-outline-variant/15 p-6">
          <h2 className="text-lg font-bold font-headline text-on-surface mb-4">Profile</h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-on-surface-variant font-headline">Name</p>
              <p className="text-sm font-body text-on-surface mt-1">{user.name || "Not set"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-on-surface-variant font-headline">Email</p>
              <p className="text-sm font-body text-on-surface mt-1">{user.email}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-on-surface-variant font-headline">Phone</p>
              <p className="text-sm font-body text-on-surface mt-1">{user.phone || "Not set"}</p>
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-outline-variant/15 p-6">
          <h2 className="text-lg font-bold font-headline text-on-surface mb-4">Roles</h2>
          <div className="flex flex-wrap gap-2">
            {user.roles.map((role) => (
              <span
                key={role}
                className="rounded-full bg-primary/10 px-3 py-1 text-sm text-primary font-medium font-body"
              >
                {role}
              </span>
            ))}
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-outline-variant/15 p-6">
          <h2 className="text-lg font-bold font-headline text-on-surface mb-4">Identity Verification</h2>
          <div className="flex items-center gap-2">
            <VerificationStatusChip
              status={user.identityStatus.toLowerCase() as "unverified" | "pending" | "verified" | "rejected" | "expired"}
            />
          </div>
          <p className="mt-3 text-sm text-on-surface-variant font-body">
            Complete identity verification to unlock higher trust levels.
          </p>
        </div>
      </div>
    </main>
  );
}
`;

fs.writeFileSync('/Users/cheng/lusia/src/app/(dashboard)/buyer/page.tsx', buyerContent);
fs.writeFileSync('/Users/cheng/lusia/src/app/(dashboard)/seller/page.tsx', sellerContent);
fs.writeFileSync('/Users/cheng/lusia/src/app/(dashboard)/landlord/page.tsx', landlordContent);
fs.writeFileSync('/Users/cheng/lusia/src/app/(dashboard)/tenant/page.tsx', tenantContent);
fs.writeFileSync('/Users/cheng/lusia/src/app/(dashboard)/settings/page.tsx', settingsContent);

console.log("Rewrote 5 files successfully.");
