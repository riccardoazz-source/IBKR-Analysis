import IBKRApp from "@/components/IBKRApp";

// This app is fully client-side — disable static prerendering
export const dynamic = "force-dynamic";

export default function Home() {
  return <IBKRApp />;
}
