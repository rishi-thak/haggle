"use client";

import { useState } from "react";

interface PayoutSetupProps {
  token: string;
  payoutMethod: string | null;
}

export default function PayoutSetup({ token, payoutMethod }: PayoutSetupProps) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSetupBank() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/pay/${token}/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "ach" }),
      });
      const data = await res.json();
      if (data.kycUrl) {
        window.location.href = data.kycUrl;
      } else if (data.error) {
        setError(data.error);
      } else {
        setDone(true);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="text-center py-4">
        <p className="text-green-700 font-medium">Bank account linked!</p>
        <p className="text-sm text-gray-500 mt-1">
          You&apos;ll receive payment once the job is confirmed complete.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Set up your payout</h2>
      <p className="text-sm text-gray-600 mb-4">
        Link your bank account to receive payment once the job is done.
        Your information is handled securely — we never store your bank details.
      </p>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      <button
        onClick={handleSetupBank}
        disabled={loading}
        className="w-full bg-gray-900 text-white rounded-xl py-3 px-4 font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Setting up..." : "Link bank account (ACH)"}
      </button>

      <p className="text-xs text-gray-400 text-center mt-3">
        Secure identity verification powered by Bridge
      </p>
    </div>
  );
}
