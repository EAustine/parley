import { expect, test } from "./fixtures";

import { signIn } from "./auth";
import { joinAs, leave, wakeControls, type Participant } from "./room.helpers";

/** Written as an escape, never as a literal byte — see `lib/livekit/identity.ts`. */
const BIDI_OVERRIDE = "\u202E";

/**
 * A host is not their inbox.
 *
 * The token route derived a display name as
 * `requested ?? full_name ?? user.email ?? "Host"`, and the join page wrote the
 * same chain out again. §3.1 offers two ways in and only one leaves a name:
 * Google fills `full_name` from the profile, the magic link fills nothing, and
 * nothing writes the field afterwards — so for **every magic-link host** the
 * branch meant to be rare was the whole answer, and they joined under their
 * email address. It went on their tile, into the people
 * panel, onto every chat line, into the join announcement, and into "{name}
 * asked you to mute", in front of everyone holding the link.
 *
 * §3.2 had already decided that a link-holder learns a meeting's *title* and
 * never its host's identity, because a name is a new class of disclosure. An
 * address someone can write to is a wider one, and nobody chose it.
 *
 * ## Why the suite could not have caught it
 *
 * `joinAs` fills the name field only when one is rendered, and the field was
 * hidden from anyone signed in — so every host test typed a name that was
 * silently discarded. One spec had already worked *around* the symptom rather
 * than reporting it, asserting the mute prompt against the host's email
 * because "hard-coding the name here would have been a test asserting
 * something the product does not do". It was the product that was wrong.
 *
 * ## What each case pins
 *
 * The first goes at the route with no browser in the way: signed in, no name
 * anywhere, and the answer has to be a refusal rather than a name derived from
 * the session. Restore the `?? user.email` tail and it returns 200 with an
 * address in `displayName`, failing on both assertions. The pre-join and
 * in-room cases are the same guarantee from further out, and they are not
 * redundant — a mutation of `app/j/[code]/page.tsx` alone is invisible to the
 * route case and is caught only by them.
 */
test.describe("display names, and the email that used to be one", () => {
  const open: Participant[] = [];

  test.afterEach(async () => {
    while (open.length) {
      const p = open.pop()!;
      await leave(p).catch(() => {});
      await p.context.close().catch(() => {});
    }
  });

  /**
   * The load-bearing case. No pre-join, no page — the endpoint, asked directly.
   *
   * `page.request` carries the page's cookies, so this is the same session the
   * browser has. That is what makes the question meaningful: the route is being
   * asked to name somebody it *can* identify, and has to decline.
   */
  test("refuses to name a signed-in person from their email address", async ({
    page,
    hostedMeeting,
  }) => {
    await signIn(page, hostedMeeting.email, "/dashboard");
    await expect(page.getByRole("heading", { name: "Meetings" })).toBeVisible();

    const response = await page.request.post("/api/livekit/token", {
      // No `displayName`. This is exactly what `RoomEntry` sends when a link is
      // opened directly, a tab is restored, or storage refused the handoff.
      data: { code: hostedMeeting.code },
    });
    const body = (await response.json()) as {
      error?: string;
      displayName?: string;
    };

    // The gate: a session is not a name, and there is no third source.
    expect(response.status(), "a nameless account was given a name").toBe(400);
    expect(body.error).toBe("display_name_required");
    // The consequence, asserted separately so a changed status code cannot
    // quietly satisfy the half that matters.
    expect(
      JSON.stringify(body),
      "the response carries the caller's email address",
    ).not.toContain(hostedMeeting.email);
  });

  /**
   * The other branch, which nothing could reach until `namedHost` existed.
   *
   * An account carrying a name still supplies it — the fix removed the email
   * and the manufactured `"Host"`, not the account name. And it now arrives
   * through `sanitiseDisplayName`: `user_metadata` is writable by its owner, so
   * the bidi override in the fixture's `full_name` is the same untrusted input
   * the join field takes, on a different road.
   */
  test("names a signed-in person from their account, sanitised", async ({
    page,
    namedHost,
  }) => {
    await signIn(page, namedHost.email, "/dashboard");
    await expect(page.getByRole("heading", { name: "Meetings" })).toBeVisible();

    const response = await page.request.post("/api/livekit/token", {
      data: { code: namedHost.code },
    });
    expect(response.status()).toBe(200);

    const body = (await response.json()) as { displayName: string };
    expect(body.displayName).toBe(namedHost.name);
    expect(
      body.displayName,
      "a bidi override survived from user_metadata onto a tile label",
    ).not.toContain(BIDI_OVERRIDE);
  });

  /**
   * §3.3's field list says "display-name field for guests", written believing
   * an account always knows its own name. It does not, so the field is shown to
   * whoever has not already said what they are called.
   *
   * Read from `page.content()` rather than from rendered text: `signedInName`
   * is a server-component prop, so under the old chain the address was in the
   * flight payload whether or not anything drew it. "Nowhere on the screen" is
   * the weaker claim; "never sent to the browser" is the one worth having.
   */
  test("pre-join asks a signed-in person whose account has no name", async ({
    page,
    hostedMeeting,
  }) => {
    await signIn(page, hostedMeeting.email, `/j/${hostedMeeting.code}`);

    await expect(page.getByLabel("Your name")).toBeVisible();
    // Empty, not helpfully pre-filled with the address — suggesting it is the
    // same disclosure, one keystroke later.
    await expect(page.getByLabel("Your name")).toHaveValue("");
    expect(
      await page.content(),
      "the join page sent the visitor's email address to the browser",
    ).not.toContain(hostedMeeting.email);
  });

  /** And stops asking once there is an answer on the account. */
  test("pre-join does not ask an account that already has a name", async ({
    page,
    namedHost,
  }) => {
    await signIn(page, namedHost.email, `/j/${namedHost.code}`);

    await expect(page.getByRole("button", { name: "Join meeting" })).toBeVisible();
    await expect(page.getByLabel("Your name")).toHaveCount(0);
  });

  /**
   * The whole path, and the only case that sees what other people see.
   *
   * The route case cannot fail on a mutation of the *page*: restore the email
   * chain in `app/j/[code]/page.tsx` alone and the field disappears, `joinAs`
   * skips filling it, no `displayName` is sent, and the address is what the
   * room renders. This reads the host's own tile and the people panel, which is
   * where a name is actually published.
   */
  test("a host joins under the name they chose, and their email is nowhere in the room", async ({
    browser,
    hostedMeeting,
  }) => {
    const host = await joinAs(browser, "Ama Serwaa", {
      code: hostedMeeting.code,
      withMedia: false,
      asHost: hostedMeeting.email,
    });
    open.push(host);

    // Scoped by attribute, not by visible text: the room grows chat rows and
    // join announcements carrying the same name, and a text query widens with
    // them.
    await expect(host.page.locator("[data-participant]").first()).toContainText(
      "Ama Serwaa",
    );

    await wakeControls(host.page);
    await host.page.getByRole("button", { name: "Participants" }).click();
    await expect(host.page.getByRole("tabpanel", { name: "People" })).toContainText(
      "Ama Serwaa",
    );

    expect(
      await host.page.locator("body").innerText(),
      "the host's email address is rendered somewhere in the room",
    ).not.toContain(hostedMeeting.email);
  });

  /**
   * The direct-link path, which now refuses — and lands somewhere designed.
   *
   * `/room/[code]` with nothing in `sessionStorage` mints its own token and has
   * no name to send. Before the fix it "succeeded" by naming the person after
   * their inbox. `CLAUDE.md` forbids shipping a working control that lands on a
   * framework default; a refusal is held to the same standard.
   */
  test("a direct room link with no name sends a host to pre-join, not to a dead end", async ({
    page,
    hostedMeeting,
  }) => {
    await signIn(page, hostedMeeting.email, "/dashboard");
    await expect(page.getByRole("heading", { name: "Meetings" })).toBeVisible();

    await page.goto(`/room/${hostedMeeting.code}`);

    await expect(
      page.getByRole("heading", { name: "A name is needed first" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Back to the join screen" }),
    ).toHaveAttribute("href", `/j/${hostedMeeting.code}`);
  });
});
