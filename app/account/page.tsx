import AccountForm from "./account-form";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  return <AccountForm initialMode={mode === "register" ? "sign-up" : "sign-in"} />;
}
