import { Receipt } from "@phosphor-icons/react/dist/ssr"

import { createMetadata } from "@/lib/seo"

export const metadata = createMetadata({
  title: "History",
  description: "Your transaction and signing history on Bunkr.",
  path: "/app/history",
  noIndex: true,
})

export default function HistoryPage() {
  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="flex w-full max-w-xl flex-col gap-4 text-sm">
        <div>
          <h1 className="text-lg font-medium">History</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Your transaction and signing history.
          </p>
        </div>

        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
          <Receipt size={32} className="text-muted-foreground" />
          <div>
            <p className="font-medium">No transactions yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Once you sign messages or move funds, they&rsquo;ll be recorded
              here.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
