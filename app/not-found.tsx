import { FriendlyErrorState } from "@/components/friendly-error-state";

export default function NotFound() {
  return (
    <FriendlyErrorState
      eyebrow="404"
      title="We kunnen deze pagina niet vinden"
      message="De link kan verouderd zijn of de change bestaat niet meer. Ga terug naar het dashboard of start een nieuwe change."
      primaryHref="/"
      primaryLabel="Naar dashboard"
      secondaryHref="/change-catalog"
      secondaryLabel="Nieuwe change"
    />
  );
}
