import { FriendlyErrorState } from "@/components/friendly-error-state";

export default function NotFound() {
  return (
    <FriendlyErrorState
      eyebrow="404"
      title="We kunnen deze pagina niet vinden"
      message="De link kan verouderd zijn of de change bestaat niet meer. Ga terug naar het overzicht of start een nieuwe change."
      primaryHref="/changes"
      primaryLabel="Naar changes"
      secondaryHref="/changes/new"
      secondaryLabel="Nieuwe change"
    />
  );
}
