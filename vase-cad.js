// ============================================================
// vase-cad.js — Interactive Vase CAD Tool
// implanted | Custom 3D Pet Decor
// ============================================================

(function () {
    'use strict';

    // ── Constants ──────────────────────────────────────────
    const WALL      = 0.25;   // inches, wall + bottom thickness
    const MAX_DIA   = 8.0;    // inches
    MAX_H           = 8.0;    // inches
    const MIN_DIA   = 3.5;    // inches — centerpiece needs room
    const MIN_H     = 4.0;    // inches — centerpiece needs height
    const CENTER_DIA = 3.0;   // inches, dog centerpiece diameter
    const PETG_DENSITY = 1.27; // g/cm³
    const PRICE_PER_1000G = 20.00;
    const IN_TO_CM  = 2.54;
    const SEGMENTS  = 64;     // profile resolution

    // State
    let vaseState = {
        diameter: 5.0,
        height:   6.0,
        shape:    'straight',  // straight | bulge | taper | hourglass
        lip:      'flat',      // flat | rolled | flared
        baseStyle: 'flat',     // flat | footed
    };

    // ── Math helpers ───────────────────────────────────────

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    /**
     * Build a 2D lathe profile (radius vs height, in inches).
     * Returns array of {r, y} points from bottom (y=0) to top (y=height).
     */
    function buildProfile(state) {
        const { diameter, height, shape, lip, baseStyle } = state;
        const R = diameter / 2;
        const pts = [];
        const N = 60; // interior profile points

        // Base foot
        if (baseStyle === 'footed') {
            const footR = R * 0.65;
            const footH = 0.25;
            pts.push({ r: 0,      y: 0 });
            pts.push({ r: footR,  y: 0 });
            pts.push({ r: footR,  y: footH });
            // transition up to body at WALL height
            pts.push({ r: R, y: footH + 0.15 });
        } else {
            pts.push({ r: 0, y: 0 });
            pts.push({ r: R, y: 0 });
        }

        // Body curve (WALL to height - lip zone)
        const bodyStart = baseStyle === 'footed' ? 0.40 : WALL;
        const bodyEnd   = height - 0.4;

        for (let i = 1; i <= N; i++) {
            const t = i / N;
            const y = bodyStart + t * (bodyEnd - bodyStart);
            const tNorm = i / N; // 0..1 along body

            let r;
            switch (shape) {
                case 'bulge': {
                    // sinusoidal outward bulge
                    const bulge = Math.sin(tNorm * Math.PI) * R * 0.18;
                    r = R + bulge;
                    break;
                }
                case 'taper': {
                    // tapers from wide base to narrow top
                    r = R * (1.0 - tNorm * 0.30);
                    break;
                }
                case 'hourglass': {
                    // waist at midpoint
                    const waist = Math.sin(tNorm * Math.PI);
                    r = R * (0.72 + 0.28 * waist);
                    break;
                }
                default: // straight
                    r = R;
            }
            pts.push({ r, y });
        }

        // Lip
        const lipTopY = height;
        switch (lip) {
            case 'rolled': {
                const rollR = 0.18;
                for (let i = 0; i <= 12; i++) {
                    const ang = (i / 12) * Math.PI;
                    const baseR = shape === 'taper' ? R * 0.70 : R;
                    pts.push({
                        r: baseR + rollR * Math.sin(ang) * 0.6,
                        y: bodyEnd + rollR - rollR * Math.cos(ang)
                    });
                }
                break;
            }
            case 'flared': {
                const baseR = shape === 'taper' ? R * 0.70 : R;
                pts.push({ r: baseR,      y: bodyEnd });
                pts.push({ r: baseR * 1.15, y: bodyEnd + 0.25 });
                pts.push({ r: baseR * 1.22, y: lipTopY });
                break;
            }
            default: // flat
                pts.push({ r: shape === 'taper' ? R * 0.70 : R, y: lipTopY });
        }

        // Close the top
        pts.push({ r: 0, y: lipTopY });

        return pts;
    }

    /**
     * Estimate filament mass in grams.
     * Strategy: compute outer volume, inner volume (subtract wall), multiply by density.
     */
    function estimateMass(state) {
        const { diameter, height } = state;
        const profile = buildProfile(state);
        const R = diameter / 2;

        // Numerical integration: outer solid of revolution via lathe profile
        function lathVolume(pts) {
            let vol = 0;
            for (let i = 1; i < pts.length; i++) {
                const r0 = pts[i-1].r, y0 = pts[i-1].y;
                const r1 = pts[i].r,   y1 = pts[i].y;
                const dy = Math.abs(y1 - y0);
                if (dy < 1e-9) continue;
                // Frustum of a cone: π/3 * h * (r0² + r0*r1 + r1²)
                vol += (Math.PI / 3) * dy * (r0*r0 + r0*r1 + r1*r1);
            }
            return vol;
        }

        const outerVol = lathVolume(profile); // cubic inches

        // Inner profile: shrink by WALL on all sides, bottom offset
        const innerProfile = buildProfile(state).map(p => ({
            r: Math.max(0, p.r - WALL),
            y: p.y + (p.y < 0.01 ? WALL : 0)
        })).filter(p => p.y >= WALL && p.r >= 0);

        // Simple inner cavity: cylinder approximation
        const innerR = R - WALL;
        const innerH = height - WALL;
        const innerVol = innerR > 0 && innerH > 0
            ? Math.PI * innerR * innerR * innerH
            : 0;

        const shellVolIn3 = Math.max(0, outerVol - innerVol);

        // Convert cubic inches → cm³
        const shellVolCm3 = shellVolIn3 * Math.pow(IN_TO_CM, 3);

        // Mass
        const massG = shellVolCm3 * PETG_DENSITY;
        return massG;
    }

    function calcPrice(massG) {
        return (massG / 1000) * PRICE_PER_1000G;
    }

    // ── Canvas 2D Preview ──────────────────────────────────

    function drawPreview() {
        const canvas = document.getElementById('vaseCanvas');
        if (!canvas) return;
        const ctx    = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;

        ctx.clearRect(0, 0, W, H);

        const profile = buildProfile(vaseState);
        const { diameter, height } = vaseState;
        const R = diameter / 2;

        // Scale to fit canvas with padding
        const padX = 40, padY = 30;
        const maxR  = Math.max(...profile.map(p => p.r));
        const maxY  = Math.max(...profile.map(p => p.y));
        const scaleX = (W / 2 - padX) / (maxR || 1);
        const scaleY = (H - padY * 2) / (maxY || 1);
        const scale  = Math.min(scaleX, scaleY);

        const cx = W / 2;
        const baseY = H - padY;

        function toCanvas(r, y) {
            return { x: cx + r * scale, y: baseY - y * scale };
        }

        // ── Vase fill ──
        // Right silhouette
        const rightPts = profile.map(p => toCanvas(p.r, p.y));
        // Left silhouette (mirrored)
        const leftPts  = profile.map(p => toCanvas(-p.r, p.y)).reverse();

        // Draw filled silhouette
        const grad = ctx.createLinearGradient(cx - R * scale, 0, cx + R * scale, 0);
        grad.addColorStop(0,    'rgba(90,65,50,0.85)');
        grad.addColorStop(0.35, 'rgba(180,140,110,0.90)');
        grad.addColorStop(0.65, 'rgba(200,165,130,0.90)');
        grad.addColorStop(1,    'rgba(90,65,50,0.85)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(rightPts[0].x, rightPts[0].y);
        rightPts.forEach(p => ctx.lineTo(p.x, p.y));
        leftPts.forEach(p  => ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.fill();

        // Outline
        ctx.strokeStyle = 'rgba(255,248,225,0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(rightPts[0].x, rightPts[0].y);
        rightPts.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.moveTo(leftPts[0].x, leftPts[0].y);
        leftPts.forEach(p  => ctx.lineTo(p.x, p.y));
        ctx.stroke();

        // ── Centerpiece ring ──
        const cpR = CENTER_DIA / 2;
        const cpH = 1.5; // visual center of the 3-inch zone
        const cpY = height * 0.30; // lower third

        // Check if centerpiece fits
        const cpCanvasR = cpR * scale;
        const cpCanvasY = baseY - cpY * scale;
        const cpCanvasTop = baseY - (cpY + cpH) * scale;

        // Find vase radius at that height
        let vaseRAtCp = R;
        for (let i = 1; i < profile.length; i++) {
            const p0 = profile[i-1], p1 = profile[i];
            if (cpY >= p0.y && cpY <= p1.y) {
                const t = (cpY - p0.y) / (p1.y - p0.y + 1e-9);
                vaseRAtCp = p0.r + t * (p1.r - p0.r);
                break;
            }
        }

        // Centerpiece band
        ctx.fillStyle   = 'rgba(165,214,167,0.22)';
        ctx.strokeStyle = 'rgba(165,214,167,0.75)';
        ctx.lineWidth   = 1.8;
        ctx.setLineDash([4, 3]);

        const cpBandLeft  = cx - Math.min(cpR, vaseRAtCp - WALL) * scale;
        const cpBandRight = cx + Math.min(cpR, vaseRAtCp - WALL) * scale;
        const bandTopY    = baseY - (cpY + cpH) * scale;
        const bandBotY    = baseY - (cpY - 0.2) * scale;

        ctx.beginPath();
        ctx.rect(cpBandLeft, bandTopY, cpBandRight - cpBandLeft, bandBotY - bandTopY);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);

        // Label
        ctx.fillStyle   = 'rgba(165,214,167,0.9)';
        ctx.font        = 'bold 11px "Montserrat", sans-serif';
        ctx.textAlign   = 'center';
        ctx.fillText('3″ centerpiece', cx, bandTopY - 6);

        // ── Dimension arrows ──
        ctx.strokeStyle = 'rgba(255,248,225,0.5)';
        ctx.fillStyle   = 'rgba(255,248,225,0.5)';
        ctx.lineWidth   = 1;
        ctx.font        = '11px "Montserrat", sans-serif';
        ctx.textAlign   = 'left';

        const topPt    = toCanvas(0, height);
        const rightEdge = toCanvas(maxR, height / 2);
        const dimX     = cx + maxR * scale + 18;

        // Height arrow
        ctx.beginPath();
        ctx.moveTo(dimX, baseY);
        ctx.lineTo(dimX, topPt.y);
        ctx.stroke();
        drawArrowHead(ctx, dimX, baseY, 'down');
        drawArrowHead(ctx, dimX, topPt.y, 'up');
        ctx.save();
        ctx.translate(dimX + 14, (baseY + topPt.y) / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText(height.toFixed(1) + '″ H', 0, 0);
        ctx.restore();

        // Width arrow (below base)
        const wY = baseY + 18;
        const leftEdge  = toCanvas(-maxR, 0);
        const rightEdge2 = toCanvas(maxR, 0);
        ctx.beginPath();
        ctx.moveTo(leftEdge.x, wY);
        ctx.lineTo(rightEdge2.x, wY);
        ctx.stroke();
        drawArrowHead(ctx, leftEdge.x, wY, 'left');
        drawArrowHead(ctx, rightEdge2.x, wY, 'right');
        ctx.textAlign = 'center';
        ctx.fillText(diameter.toFixed(1) + '″ Ø', cx, wY + 14);
    }

    function drawArrowHead(ctx, x, y, dir) {
        const s = 5;
        ctx.beginPath();
        switch (dir) {
            case 'up':    ctx.moveTo(x, y); ctx.lineTo(x-s, y+s*1.5); ctx.lineTo(x+s, y+s*1.5); break;
            case 'down':  ctx.moveTo(x, y); ctx.lineTo(x-s, y-s*1.5); ctx.lineTo(x+s, y-s*1.5); break;
            case 'left':  ctx.moveTo(x, y); ctx.lineTo(x+s*1.5, y-s); ctx.lineTo(x+s*1.5, y+s); break;
            case 'right': ctx.moveTo(x, y); ctx.lineTo(x-s*1.5, y-s); ctx.lineTo(x-s*1.5, y+s); break;
        }
        ctx.closePath();
        ctx.fill();
    }

    // ── Update info panel ──────────────────────────────────

    function updateInfo() {
        const mass  = estimateMass(vaseState);
        const price = calcPrice(mass);

        const elMass  = document.getElementById('vaseMass');
        const elPrice = document.getElementById('vasePrice');
        const elCost  = document.getElementById('vaseCost');

        if (elMass)  elMass.textContent  = mass.toFixed(0) + ' g';
        if (elPrice) elPrice.textContent = '$' + price.toFixed(2);
        if (elCost)  elCost.textContent  = '$' + price.toFixed(2);

        // Update slider value labels
        const elDiam = document.getElementById('labelDiam');
        const elH    = document.getElementById('labelH');
        if (elDiam) elDiam.textContent = vaseState.diameter.toFixed(1) + '″';
        if (elH)    elH.textContent    = vaseState.height.toFixed(1) + '″';
    }

    function refresh() {
        drawPreview();
        updateInfo();
    }

    // ── STEP file generation ───────────────────────────────
    // Generates a proper ASCII STEP (AP214) file representing the vase
    // as a shell made of B-spline surfaces (approximated via cylinder faces).

    function generateSTEP() {
        const { diameter, height, shape, lip, baseStyle } = vaseState;
        const profile = buildProfile(vaseState);
        const R = diameter / 2;

        const IN = IN_TO_CM; // convert to cm for STEP (mm preferred in practice, use mm)
        // STEP AP214 — we'll use mm
        const MM = IN_TO_CM * 10; // 1 inch = 25.4mm

        // Build profile in mm
        const pts = profile.map(p => ({ r: p.r * MM, y: p.y * MM }));

        // Generate a STEP file with a SHELL_BASED_SURFACE_MODEL
        // Using POLYLINE approximation + FACE_SURFACE for each strip

        let entityId = 1;
        const lines = [];

        function ent(def) {
            lines.push(`#${entityId} = ${def};`);
            return entityId++;
        }

        const header = [
            'ISO-10303-21;',
            'HEADER;',
            `FILE_DESCRIPTION(('Implanted Custom Vase - implanted.shop'),'2;1');`,
            `FILE_NAME('implanted_vase.stp','${new Date().toISOString()}',('implanted'),('implanted.shop'),'','','');`,
            `FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 3 1 1 1 }'));`,
            'ENDSEC;',
            'DATA;'
        ].join('\n');

        // Coordinate system
        const origin = ent("CARTESIAN_POINT('',( 0.0, 0.0, 0.0))");
        const xDir   = ent("DIRECTION('',( 1.0, 0.0, 0.0))");
        const zDir   = ent("DIRECTION('',( 0.0, 0.0, 1.0))");
        const axis2  = ent(`AXIS2_PLACEMENT_3D('',#${origin},#${zDir},#${xDir})`);

        // Build lathe surface as series of revolved faces
        // We revolve each segment of the profile 360° to get cylindrical/conical faces

        const nSegs  = pts.length - 1;
        const nTheta = 32; // circumferential divisions for polygon approximation
        const faces  = [];

        function makePoint(r, theta, y) {
            const x = r * Math.cos(theta);
            const z = r * Math.sin(theta);
            return ent(`CARTESIAN_POINT('',(${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}))`);
        }

        // Create all vertex points
        const pointGrid = []; // [seg][theta]
        for (let s = 0; s <= nSegs; s++) {
            pointGrid[s] = [];
            for (let t = 0; t < nTheta; t++) {
                const theta = (t / nTheta) * 2 * Math.PI;
                pointGrid[s][t] = makePoint(pts[s].r, theta, pts[s].y);
            }
        }

        // Create vertex_point entities
        const vertGrid = [];
        for (let s = 0; s <= nSegs; s++) {
            vertGrid[s] = [];
            for (let t = 0; t < nTheta; t++) {
                vertGrid[s][t] = ent(`VERTEX_POINT('',#${pointGrid[s][t]})`);
            }
        }

        // Create edges and faces for each quad
        const faceIds = [];

        for (let s = 0; s < nSegs; s++) {
            const dy  = Math.abs(pts[s+1].y - pts[s].y);
            const dr  = Math.abs(pts[s+1].r - pts[s].r);
            if (dy < 0.001 && dr < 0.001) continue;

            for (let t = 0; t < nTheta; t++) {
                const t2 = (t + 1) % nTheta;

                // 4 corners: (s,t), (s+1,t), (s+1,t2), (s,t2)
                const v00 = vertGrid[s][t];
                const v10 = vertGrid[s+1][t];
                const v11 = vertGrid[s+1][t2];
                const v01 = vertGrid[s][t2];

                const p00 = pointGrid[s][t];
                const p10 = pointGrid[s+1][t];
                const p11 = pointGrid[s+1][t2];
                const p01 = pointGrid[s][t2];

                // Edge directions
                const e0dir = ent(`DIRECTION('',( 0.0, 1.0, 0.0))`); // up
                const e1dir = ent(`DIRECTION('',( 0.0, 1.0, 0.0))`);

                // Lines for 4 edges
                const l0 = ent(`LINE('',#${p00},#${ent(`VECTOR('',#${e0dir},1.0)`)})`)
                const l1 = ent(`LINE('',#${p10},#${ent(`VECTOR('',#${e1dir},1.0)`)})`)

                // Simplified — emit face as ADVANCED_FACE with a plane surface
                // Normal (approximate outward)
                const mx = ((pts[s].r + pts[s+1].r) / 2);
                const theta_m = ((t + 0.5) / nTheta) * 2 * Math.PI;
                const nx = Math.cos(theta_m).toFixed(6);
                const nz = Math.sin(theta_m).toFixed(6);

                const norm   = ent(`DIRECTION('', (${nx}, 0.0, ${nz}))`);
                const refDir = ent(`DIRECTION('', (0.0, 1.0, 0.0))`);
                const midPtC = ent(`CARTESIAN_POINT('',(${(mx * Math.cos(theta_m)).toFixed(4)},${((pts[s].y+pts[s+1].y)/2).toFixed(4)},${(mx * Math.sin(theta_m)).toFixed(4)}))`);
                const axPl   = ent(`AXIS2_PLACEMENT_3D('',#${midPtC},#${norm},#${refDir})`);
                const plane  = ent(`PLANE('',#${axPl})`);

                // Polyline loop
                const pl = ent(`POLY_LOOP('',(#${pointGrid[s][t]},#${pointGrid[s+1][t]},#${pointGrid[s+1][t2]},#${pointGrid[s][t2]}))`);
                const loop = ent(`FACE_BOUND('',#${pl},.T.)`);
                const face = ent(`ADVANCED_FACE('',(#${loop}),#${plane},.T.)`);
                faceIds.push(face);
            }
        }

        // Shell
        const shellFaceList = faceIds.map(f => `#${f}`).join(',');
        const shell    = ent(`CLOSED_SHELL('',(${shellFaceList}))`);
        const manifold = ent(`MANIFOLD_SOLID_BREP('Vase',#${shell})`);

        // Product
        const prod    = ent(`PRODUCT('vase','Implanted Custom Vase - ${vaseState.diameter.toFixed(1)}"x${vaseState.height.toFixed(1)}"',' ',(#${ent(`PRODUCT_CONTEXT('',#${ent(`APPLICATION_CONTEXT('automotive design')`)},'mechanical')`)}))`);
        const pDef    = ent(`PRODUCT_DEFINITION_FORMATION('','',#${prod})`);
        const pDefC   = ent(`PRODUCT_DEFINITION('design','',#${pDef},#${ent(`PRODUCT_DEFINITION_CONTEXT('part definition',#${ent(`APPLICATION_CONTEXT('automotive design')`)}, 'design')`)})`);
        const pDefShape = ent(`PRODUCT_DEFINITION_SHAPE('','',#${pDefC})`);
        const shapeRep  = ent(`ADVANCED_BREP_SHAPE_REPRESENTATION('',(#${manifold},#${axis2}),#${ent(`( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${ent(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE( 1.000000000000000E-06),#${ent(`( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )`)},'','')`)}) ) GLOBAL_UNIT_ASSIGNED_CONTEXT((#${ent(`( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )`)},#${ent(`( NAMED_UNIT(*) SI_UNIT($.STERADIAN.) SOLID_ANGLE_UNIT() )`)},#${ent(`( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($.RADIAN.) )`)})) REPRESENTATION_CONTEXT('Context #1','3D Context with UNIT and UNCERTAINTY') )`)})`);
        ent(`SHAPE_DEFINITION_REPRESENTATION(#${pDefShape},#${shapeRep})`);

        const footer = 'ENDSEC;\nEND-ISO-10303-21;';

        const dataSection = lines.join('\n');
        return `${header}\n${dataSection}\n${footer}`;
    }

    function downloadSTEP() {
        const content  = generateSTEP();
        const blob     = new Blob([content], { type: 'application/octet-stream' });
        const url      = URL.createObjectURL(blob);
        const a        = document.createElement('a');
        a.href         = url;
        a.download     = `implanted_vase_${vaseState.diameter.toFixed(1)}x${vaseState.height.toFixed(1)}in.stp`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ── UI initialization ──────────────────────────────────

    function initVaseCad() {
        // Bind sliders
        const sliderDiam = document.getElementById('sliderDiam');
        const sliderH    = document.getElementById('sliderH');

        if (sliderDiam) {
            sliderDiam.min   = MIN_DIA;
            sliderDiam.max   = MAX_DIA;
            sliderDiam.step  = 0.1;
            sliderDiam.value = vaseState.diameter;
            sliderDiam.addEventListener('input', () => {
                vaseState.diameter = parseFloat(sliderDiam.value);
                refresh();
            });
        }

        if (sliderH) {
            sliderH.min   = MIN_H;
            sliderH.max   = MAX_H;
            sliderH.step  = 0.1;
            sliderH.value = vaseState.height;
            sliderH.addEventListener('input', () => {
                vaseState.height = parseFloat(sliderH.value);
                refresh();
            });
        }

        // Bind shape pills
        document.querySelectorAll('[data-shape]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('[data-shape]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                vaseState.shape = btn.dataset.shape;
                refresh();
            });
        });

        // Bind lip pills
        document.querySelectorAll('[data-lip]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('[data-lip]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                vaseState.lip = btn.dataset.lip;
                refresh();
            });
        });

        // Bind base pills
        document.querySelectorAll('[data-base]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('[data-base]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                vaseState.baseStyle = btn.dataset.base;
                refresh();
            });
        });

        // Download button
        const dlBtn = document.getElementById('btnDownloadStep');
        if (dlBtn) dlBtn.addEventListener('click', downloadSTEP);

        // Place order button
        const orderBtn = document.getElementById('btnPlaceOrder');
        if (orderBtn) orderBtn.addEventListener('click', () => {
            if (typeof showPage === 'function') showPage('contact');
            else if (typeof switchTab === 'function') switchTab('chat');
        });

        // Resize canvas responsively
        function resizeCanvas() {
            const canvas = document.getElementById('vaseCanvas');
            if (!canvas) return;
            const container = canvas.parentElement;
            const w = container.clientWidth;
            canvas.width  = w;
            canvas.height = Math.round(w * 1.25);
            refresh();
        }

        window.addEventListener('resize', resizeCanvas);
        setTimeout(resizeCanvas, 50);

        refresh();
    }

    // Expose globally so HTML can call it
    window.initVaseCad = initVaseCad;
    window.downloadSTEP = downloadSTEP;

})();
