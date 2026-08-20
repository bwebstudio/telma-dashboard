/**
 * Carlos, with the sheet cut into nodes.
 *
 * The same call, measured against the same criteria, so the only difference is
 * the shape of the instructions. This is the test the split has to pass: the
 * crossing from cancelling to booking is exactly where "does not ask for the
 * details twice" would break again, and the bar is the number the single sheet
 * gives today, which is one in eight.
 */
import base from './dupla-gestao.mjs'

export default { ...base, nodes: true }
