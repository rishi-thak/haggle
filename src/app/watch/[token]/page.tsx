import WatchDashboard from "./watch-dashboard";

export default async function WatchPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <WatchDashboard token={token} />;
}
