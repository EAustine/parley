/**
 * How long the dashboard waits before asking the server for itself again —
 * v1.3 D5.
 *
 * Its own module, and not a constant inside the component, so the test can
 * import the real number instead of transcribing it. A copy in a spec agrees
 * with the source until one of them is edited, and the one that gets edited is
 * never the one anybody reads.
 *
 * Nothing here imports React, which is what makes that possible.
 *
 * ## Why ten seconds
 *
 * Every refresh is an uncacheable RLS query and an RSC render, and somebody
 * moving between a document and this tab can produce a dozen returns a minute —
 * none of which is the "came back to it" D5 describes.
 *
 * But the gap is also a **staleness window**. The clock starts at mount,
 * because the page has just been rendered from the server and that *is* an ask,
 * so nothing refreshes inside it. At thirty seconds a real return half a minute
 * after loading would show stale data — the exact thing D5 exists to prevent,
 * reintroduced by the mechanism meant to make it cheap.
 *
 * Ten is well past the one-to-three-second cadence of somebody alt-tabbing, and
 * short enough that the dead zone is not a window anybody notices. It is far
 * below any interval that matters on this screen either way: the finest thing
 * on it is an elapsed time in whole minutes, and the partition's boundaries are
 * a scheduled end and a twelve-hour window.
 */
export const REFRESH_GAP_MS = 10_000;
