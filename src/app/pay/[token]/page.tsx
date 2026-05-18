import { getEscrowByPayoutToken } from "@/lib/repo";
import PayoutSetup from "./payout-setup";

export default async function PayoutPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getEscrowByPayoutToken(token);

  if (!data || !data.lead || !data.job) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Link expired</h1>
          <p className="text-gray-600">This payment link is no longer valid.</p>
        </div>
      </div>
    );
  }

  const { escrow, lead, job } = data;
  const amountDollars = (escrow.amount_cents / 100).toFixed(2);

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Payment incoming</h1>
            <p className="text-gray-600 mt-2">
              ${amountDollars} is being held for your {job.service} job
            </p>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-500">Amount</span>
              <span className="text-lg font-semibold text-gray-900">${amountDollars}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-500">Service</span>
              <span className="text-sm text-gray-900">{job.service}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-500">Status</span>
              <span className="text-sm font-medium text-amber-600">
                {escrow.status === "held" ? "Held in escrow" : escrow.status === "released" ? "Released" : "Refunded"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Release</span>
              <span className="text-sm text-gray-900">After job completion</span>
            </div>
          </div>

          {escrow.status === "held" && !escrow.provider_payout_account_id && (
            <PayoutSetup token={token} payoutMethod={escrow.provider_payout_method} />
          )}

          {escrow.status === "held" && escrow.provider_payout_account_id && (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-gray-700 font-medium">Payout method set up</p>
              <p className="text-sm text-gray-500 mt-1">
                Payment will be released once the client confirms the job is done.
              </p>
            </div>
          )}

          {escrow.status === "released" && (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-gray-700 font-medium">Payment sent!</p>
              <p className="text-sm text-gray-500 mt-1">
                ${amountDollars} has been released to your account.
              </p>
            </div>
          )}

          <p className="text-xs text-gray-400 text-center mt-6">
            Powered by Haggle &middot; Payments secured by Sponge
          </p>
        </div>
      </div>
    </div>
  );
}
