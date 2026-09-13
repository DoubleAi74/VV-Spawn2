/**
 * Which loading path the two profile routes take on a *document* request
 * (reload, typed URL, crawler). Flights always keep the skeleton.
 *
 *   'direct'   Skip the skeleton and block until the live view is ready, so
 *              the browser paints the finished dashboard once. Costs TTFB:
 *              measured ~74ms -> ~267ms locally.
 *
 *   'skeleton' Keep the early skeleton, and stop the live view taking it away
 *              again. A pre-paint script in app/[usernameTag]/layout.js reads
 *              the same sessionStorage snapshot the skeleton paints from and
 *              marks the document warm; the warm rules in globals.css then
 *              hold the cover off and size the info frames that the server
 *              could only render at the 40px floor.
 *
 * One constant, both routes. Nothing else needs to change to compare them.
 */
export const DOCUMENT_LOADING = 'skeleton';

export const SKIPS_SKELETON_ON_DOCUMENT = DOCUMENT_LOADING === 'direct';
