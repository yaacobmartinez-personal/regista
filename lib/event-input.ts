/**
 * Adapt a JSON body to the shape `eventInputSchema` expects.
 *
 * That schema was written for a form, where every value arrives as a string and
 * an unticked checkbox arrives not at all. The mobile API sends real JSON types,
 * so capacity is a number and `waitlistEnabled` a boolean. Rather than keep a
 * second schema in step — the contract requires the *same* validation messages
 * on both front ends, and two copies would drift — the body is converted to the
 * form's shape and run through the one schema.
 *
 * `null` becomes `undefined` throughout: JSON says "no end time" with null, and
 * the schema's optional fields say it with undefined.
 */
export function eventInputFromJson(body: Record<string, unknown>) {
  const { title, slug, description, startsAt, endsAt, timezone, capacity, waitlistEnabled } = body;
  return {
    title,
    slug: slug ?? undefined,
    description: description ?? undefined,
    startsAt,
    endsAt: endsAt ?? undefined,
    timezone: timezone ?? undefined,
    // The schema parses capacity from text, so a number goes back to text to be
    // parsed by the same rules — which is what keeps "Capacity must be a whole
    // number above zero." the answer on both front ends.
    capacity: capacity === null || capacity === undefined ? undefined : String(capacity),
    waitlistEnabled: waitlistEnabled ?? false,
  };
}
