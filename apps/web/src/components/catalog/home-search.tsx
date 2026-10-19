import { Button, SearchInput } from "@vira/ui";

/**
 * The search of the home page (docs/DESIGN.md, 4.1): a plain GET form to the explore
 * page, so it works before the JavaScript arrives.
 */
export function HomeSearch() {
  return (
    <form
      role="search"
      action="/eventos"
      className="flex flex-col gap-3 sm:flex-row sm:items-center"
    >
      <SearchInput
        name="q"
        label="Buscar evento"
        placeholder="Buscar evento"
        className="flex-1"
        maxLength={80}
      />
      <Button type="submit" variant="secondary" size="lg" className="sm:w-auto">
        Buscar
      </Button>
    </form>
  );
}
