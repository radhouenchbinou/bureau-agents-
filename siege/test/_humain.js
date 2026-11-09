'use strict';
// Les tests lancés depuis une session d'agent héritent de CLAUDECODE : on fixe explicitement le contexte (humain),
// sinon les outils du Siège exigeraient une entrée d'identité (EIA-001). À charger en tête des tests qui appellent un outil.
for (const k of ['SIEGE_CONTEXTE', 'CLAUDECODE', 'SIEGE_ROLE']) delete process.env[k];
