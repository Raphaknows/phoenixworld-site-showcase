import { initBlueprints } from './blueprints';
import { initBolDemo } from './bol-demo';
import { initCalc } from './calc';
import { initForm } from './form';
import { initReborn } from './reborn';
import { initScramble } from './scramble';
import { initSteps } from './steps';

initCalc();
initBlueprints();
initForm();
initReborn();
initBolDemo();
initScramble();
initSteps();
import './stage-loader';

// Phoenix voice greeting: only when the flag is "true" (preview). With it off, the module and its CSS are not in the build and nothing requests the audio.
if (import.meta.env.PUBLIC_PHOENIX_VOICE === 'true') void import('./voice').then((m) => m.initVoice());
