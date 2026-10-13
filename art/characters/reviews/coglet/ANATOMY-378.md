# Coglet anatomy review — #378

The original internal acceptance missed defects identified by the owner. The historical decisions are preserved in `source/coglet/correction-378/review-history.json`; they are not evidence that the old anatomy was correct. Owner taste for the correction remains pending.

Reviewed the corrected portrait, all forty follower frames and twenty battle frames at source/export resolution and through shared renderers at 37/115 px. `follower-enlarged.png` and `combat-enlarged.png` show every exported cell; `directions.png` and `combat.png` show gameplay-size rendering. Labels/order are generated from the exported row contract, not painted onto source art.

| View (all five phases) | Forward lenses                                     | Dorsal gear                                   | Legs/flank                                                |
| ---------------------- | -------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------- |
| North                  | Both occluded                                      | Thin longitudinal rim, no forward-facing disc | Symmetric rear attachments, front feet occluded           |
| Northeast              | Front face occluded                                | Oblique side face; small bearing above shell  | Rear-half flank housing stays above near rear leg         |
| East                   | Near lens at right leading edge, far lens occluded | Broad side disc                               | Near fore/rear feet retain joint/shaft/wedge construction |
| Southeast              | Two lenses together on forward face                | Oblique side face                             | Near rear housing stays behind eyes; far legs occluded    |
| South                  | Two lenses symmetrically paired                    | Thin rim; no circular bearing facing front    | Fixed four corners, rear roots partly occluded            |
| Southwest              | Two lenses on forward face                         | Oblique side face                             | Same four-corner structure and rear housing               |
| West                   | Near lens at left leading edge, far lens occluded  | Broad side disc                               | Same fore/rear articulation, not a copied rear view       |
| Northwest              | Both lenses occluded                               | Oblique side face                             | Separately generated five-phase row, stable rear housing  |

The first new follower atlas had incorrectly assigned south/west views and was rejected. The second atlas had a stray lens on the northwest rear shell; all five northwest cells were replaced using reviewed isolated source poses. Sources remain archived. Dorsal bearing cyan is not a front eye; regressions inspect the lower shell separately and allow only small bearing/antialias remnants in rear diagonals.

Battle idle/attack/hit/capture retain two forward lenses, the longitudinal cog and fixed near rear housing. Four legs share joint/shaft/wedge structure; far legs naturally occlude. Faint progressively crouches and dims lenses, with the final pose low and powered down. The first battle source lost the gear in late faint frames and was rejected; corrected faint retains the complete attached gear. Lens expression, stride, tooth phase and perspective change without deliberately changing anatomy.

Pixel measurements assert rear-shell lens occlusion, profile-lens leading-edge placement and a broader gear disc in profiles than front/rear rims across every stride. Gutters/counts/export checks prove reproducibility and safe cropping, not anatomical truth. Minor perspective and pixel-cluster variation remains generated artwork; this review does not imply owner approval or new gameplay mechanics.
