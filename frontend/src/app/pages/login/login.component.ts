import { Component, AfterViewInit, OnDestroy, ElementRef, ViewChild, NgZone, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgIf, NgClass, NgFor } from '@angular/common';
import { LoginService } from '../../core/services/Login.service';
import { NotificationService } from '../../core/services/notification.service';
import { HeartbeatService } from '../../core/services/heartbeat.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, NgIf, NgClass, NgFor],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent implements AfterViewInit, OnDestroy {
  @ViewChild('particleCanvas') private canvasRef!: ElementRef<HTMLCanvasElement>;
  Username: string = '';
  Password: string = '';
  errorMessage: string = '';
  showPassword: boolean = false;

  // Force-Login Modal state
  showForceModal: boolean = false;
  isForceLogging: boolean = false;  // prevents double-click spam on confirm

  // Split text for interactive SVG
  brandChars = 'MinebeaMitsumi'.split('');
  subtitleChars = 'Web Application For Request & Return Indirect Material & Forecast Order Plan'.split('');

  // ── Particle Engine State ──────────────────────────────────────────────────
  private animationId!: number;
  private resizeObserver!: ResizeObserver;
  private cleanupFns: (() => void)[] = [];

  constructor(
    private router: Router,
    private LoginService: LoginService,
    private notificationService: NotificationService,
    private ngZone: NgZone,
    private heartbeatService: HeartbeatService,
    @Inject(PLATFORM_ID) private platformId: object
  ) { }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.ngZone.runOutsideAngular(() => this.initParticles());
    }
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      cancelAnimationFrame(this.animationId);
      this.resizeObserver?.disconnect();
      this.cleanupFns.forEach(fn => fn());
    }
  }

  // ── Cinematic Night Sky v3 ─────────────────────────────────────────────────
  private initParticles(): void {
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;
    const H = 0.70; // horizon fade threshold (bottom 30% fades out)

    // ── Types ─────────────────────────────────────────────────────────────
    interface Star {
      x: number; y: number; r: number; base: number;
      twinkle: boolean; phase: number; spd: number; amp: number;
    }
    interface Cloud { x: number; y: number; rx: number; ry: number; a: number; spd: number; }
    interface Meteor {
      x: number; y: number; vx: number; vy: number;
      len: number; glow: number; life: number; max: number; w: number;
    }
    interface Dust {
      x: number; y: number; vx: number; vy: number;
      r: number; life: number; max: number; hue: number;
    }
    interface Lightning {
      pts: [number, number][];  // jagged bolt points from top → bottom
      alpha: number;              // current opacity (fades each frame)
      life: number;              // frames lived
      max: number;              // total lifespan (5–15 frames)
    }

    // ── State ─────────────────────────────────────────────────────────────
    let stars: Star[] = [];
    let clouds: Cloud[] = [];
    let meteors: Meteor[] = [];
    let dusts: Dust[] = [];
    let lightnings: Lightning[] = [];
    let mTimer = 0;
    let lTimer = 0;                   // counts up to next lightning spawn
    let lNext = 0;                   // initialized after rB is declared (below)
    let flashAlpha = 0;                // screen-flash overlay alpha

    // ── Helpers ───────────────────────────────────────────────────────────
    const rnd = () => Math.random();
    const rB = (a: number, b: number) => a + rnd() * (b - a);
    /** Returns 1 above horizon, linearly fades to 0 at bottom edge */
    const hA = (y: number) => {
      const hPx = canvas.height * H;
      return y > hPx ? Math.max(0, 1 - (y - hPx) / (canvas.height - hPx)) : 1;
    };
    lNext = Math.floor(rB(480, 1200)); // first lightning: 8–20 s @ 60fps (rB now in scope)

    // ── Build stars ───────────────────────────────────────────────────────
    const buildStars = () => {
      stars = [];
      const n = Math.floor((canvas.width * canvas.height) / 4500);
      for (let i = 0; i < n; i++) {
        const roll = rnd();
        let r: number, base: number;
        if (roll < 0.72) { r = rB(0.15, 0.60); base = rB(0.04, 0.13); }
        else if (roll < 0.92) { r = rB(0.60, 1.20); base = rB(0.10, 0.22); }
        else { r = rB(1.20, 2.00); base = rB(0.18, 0.34); }
        stars.push({
          x: rnd() * canvas.width,
          y: rnd() * canvas.height * 0.82, // concentrate in upper 82%
          r, base,
          twinkle: rnd() < 0.45,
          phase: rnd() * Math.PI * 2,
          spd: rB(0.00015, 0.00055),
          amp: rB(0.025, 0.075),
        });
      }
    };

    // ── Build clouds ──────────────────────────────────────────────────────
    const buildClouds = () => {
      clouds = [];
      const defs = [
        { yF: 0.72, rxF: 0.50, ry: 90, a: 0.038, spd: 0.10 },
        { yF: 0.82, rxF: 0.58, ry: 100, a: 0.042, spd: 0.07 },
        { yF: 0.92, rxF: 0.52, ry: 75, a: 0.030, spd: 0.14 },
        { yF: 0.52, rxF: 0.20, ry: 40, a: 0.020, spd: 0.05 },
        { yF: 0.63, rxF: 0.26, ry: 52, a: 0.025, spd: 0.09 },
      ];
      for (const d of defs) {
        clouds.push({
          x: rnd() * canvas.width, y: canvas.height * d.yF,
          rx: canvas.width * d.rxF, ry: d.ry, a: d.a, spd: d.spd
        });
      }
    };

    // ── Spawn meteor ──────────────────────────────────────────────────────
    const spawnMeteor = () => {
      const vy = rB(7, 20);
      const vx = rB(0.5, 3.0);
      const len = rB(80, 220);
      meteors.push({
        x: rB(0.05, 0.95) * canvas.width, y: -len,
        vx, vy, len, glow: rB(0.5, 1.0), life: 0,
        max: Math.ceil((canvas.height * 1.1 + len) / vy),
        w: rB(0.5, 1.6),
      });
    };

    // ── Spawn lightning bolt ───────────────────────────────────────────────
    const spawnLightning = () => {
      // Build a jagged path from a random top-edge point downward
      const pts: [number, number][] = [];
      const startX = rB(0.15, 0.85) * canvas.width;
      const endY = rB(0.30, 0.65) * canvas.height; // bolt ends mid-sky
      let cx = startX;
      let cy = 0;
      pts.push([cx, cy]);
      const segments = 6 + Math.floor(rnd() * 6);   // 6–11 jagged segments
      const stepY = endY / segments;
      for (let i = 1; i <= segments; i++) {
        cx += rB(-80, 80);                            // horizontal jag
        cy = i * stepY;
        pts.push([cx, cy]);
        // ~30% chance of a short branch at this node
        if (rnd() < 0.30 && i < segments - 1) {
          pts.push([cx, cy]);                         // push branch start
          pts.push([cx + rB(-60, 60), cy + rB(20, 50)]); // branch tip
          pts.push([cx, cy]);                         // return to trunk
        }
      }
      const maxLife = Math.floor(rB(22, 48)); // 0.35–0.8 s @ 60fps
      lightnings.push({ pts, alpha: 1, life: 0, max: maxLife });
      flashAlpha = 0.22;  // trigger screen flash
    };

    // ── Draw lightning bolt ────────────────────────────────────────────────
    const drawLightning = (lt: Lightning) => {
      if (lt.pts.length < 2) return;
      // Fade alpha over lifetime
      const t = lt.life / lt.max;
      const a = (1 - t) * lt.alpha;
      // Horizon fade: apply to the bolt's lowest point
      const bot = lt.pts[lt.pts.length - 1][1];
      const fa = a * hA(bot);
      if (fa <= 0.01) return;

      ctx.save();

      // Outer wide glow (electric blue)
      ctx.globalAlpha = fa * 0.55;
      ctx.strokeStyle = '#40a0ff';
      ctx.lineWidth = 8;
      ctx.shadowColor = 'rgba(0, 150, 255, 0.8)';
      ctx.shadowBlur = 35;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(lt.pts[0][0], lt.pts[0][1]);
      for (let i = 1; i < lt.pts.length; i++) ctx.lineTo(lt.pts[i][0], lt.pts[i][1]);
      ctx.stroke();

      // Inner bright core (white)
      ctx.globalAlpha = fa;
      ctx.strokeStyle = '#eaf6ff';
      ctx.lineWidth = 1.8;
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(lt.pts[0][0], lt.pts[0][1]);
      for (let i = 1; i < lt.pts.length; i++) ctx.lineTo(lt.pts[i][0], lt.pts[i][1]);
      ctx.stroke();

      ctx.restore();
    };

    // ── Draw: Moon (triple halo + crescent) ───────────────────────────────
    const drawMoon = () => {
      const mx = canvas.width * 0.80;
      const my = canvas.height * 0.13;
      const r = Math.min(canvas.width, canvas.height) * 0.034;
      const ha = hA(my);
      if (ha <= 0.01) return;

      ctx.save();
      ctx.globalAlpha = ha;

      // Three layered glow halos (large/dim → tight/bright)
      const halos: [number, number, number][] = [
        [r * 0.5, r * 5.5, 0.06],
        [r * 0.6, r * 3.0, 0.10],
        [r * 0.7, r * 1.7, 0.14],
      ];
      for (const [inner, outer, a] of halos) {
        const g = ctx.createRadialGradient(mx, my, inner, mx, my, outer);
        g.addColorStop(0, `rgba(175,220,255,${a})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(mx, my, outer, 0, Math.PI * 2); ctx.fill();
      }

      // Moon disc with soft glow
      ctx.shadowColor = 'rgba(200,240,255,0.70)';
      ctx.shadowBlur = 20;
      ctx.fillStyle = '#daeeff';
      ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill();

      // Crescent shadow bite — dark navy matches gradient bg
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#030e28';
      ctx.beginPath(); ctx.arc(mx + r * 0.53, my - r * 0.05, r * 0.87, 0, Math.PI * 2); ctx.fill();

      ctx.restore();
    };

    // ── Draw: Cloud ───────────────────────────────────────────────────────
    const drawCloud = (c: Cloud) => {
      const a = c.a * hA(c.y);
      if (a <= 0.002) return;
      ctx.save();
      ctx.globalAlpha = a;
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.rx);
      g.addColorStop(0.00, 'rgba(185,215,255,1.0)');
      g.addColorStop(0.50, 'rgba(130,175,255,0.35)');
      g.addColorStop(1.00, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(c.x, c.y, c.rx, c.ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };

    // ── Draw: Meteor streak (gradient tail + shadowBlur glow) ─────────────
    const drawMeteor = (m: Meteor) => {
      const prog = m.life / m.max;
      const fa = Math.sin(prog * Math.PI) * m.glow * hA(m.y);
      if (fa <= 0.01) return;

      const tx = m.x - m.vx * (m.len / m.vy);
      const ty = m.y - m.len;
      const g = ctx.createLinearGradient(tx, ty, m.x, m.y);
      g.addColorStop(0.0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, `rgba(185,225,255,${fa * 0.35})`);
      g.addColorStop(1.0, `rgba(255,255,255,${fa})`);

      ctx.save();
      ctx.shadowColor = `rgba(140,210,255,${fa * 0.85})`;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = g;
      ctx.lineWidth = m.w;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(m.x, m.y); ctx.stroke();
      ctx.restore();
    };

    // ── Draw: Stardust trail (additive 'lighter' = magical glow) ──────────
    const drawDusts = () => {
      if (dusts.length === 0) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter'; // additive blending
      for (const d of dusts) {
        const t = d.life / d.max;
        const a = (1 - t) * (1 - t) * 0.55;  // quadratic fade-out
        if (a <= 0.004) continue;
        const rCur = d.r * (1 + t * 1.8);        // expand radius as it fades
        const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, rCur);
        g.addColorStop(0.0, `hsla(${d.hue},100%,96%,${a})`);
        g.addColorStop(0.5, `hsla(${d.hue},100%,72%,${a * 0.38})`);
        g.addColorStop(1.0, `hsla(${d.hue},100%,60%,0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(d.x, d.y, rCur, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over'; // always restore blend mode
      ctx.restore();
    };

    // ── Resize ────────────────────────────────────────────────────────────
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      buildStars(); buildClouds();
    };
    resize();
    this.resizeObserver = new ResizeObserver(resize);
    this.resizeObserver.observe(document.documentElement);

    // ── Mouse: stardust trail ─────────────────────────────────────────────
    const onMouseMove = (e: MouseEvent) => {
      const n = 40 + Math.floor(rnd() * 3); // spawn 10-13 particles per event
      for (let i = 0; i < n; i++) {
        dusts.push({
          x: e.clientX + rB(-8, 8),
          y: e.clientY + rB(-8, 8),
          vx: rB(-0.8, 0.8),
          vy: rB(-1.3, -0.2),    // drift upward
          r: rB(0.8, 2.5),
          life: 0, max: Math.floor(rB(28, 58)),
          hue: rB(195, 245),       // blue → indigo glow
        });
      }
    };
    const onMouseLeave = () => { /* dusts self-expire naturally */ };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseleave', onMouseLeave);
    this.cleanupFns = [
      () => window.removeEventListener('mousemove', onMouseMove),
      () => window.removeEventListener('mouseleave', onMouseLeave),
    ];

    // ── Animation loop ────────────────────────────────────────────────────
    let frame = 0;
    const loop = () => {
      this.animationId = requestAnimationFrame(loop);
      frame++;

      // clearRect keeps dark blue gradient background fully visible
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 0 ── Lightning (screen flash + bolt paths — drawn first, behind everything)
      lTimer++;
      if (lTimer >= lNext) {
        spawnLightning();
        lTimer = 0;
        lNext = Math.floor(rB(480, 1200)); // next lightning in 8–20 s
      }
      // Screen flash: brief white-blue rect that fades rapidly
      if (flashAlpha > 0.002) {
        ctx.save();
        ctx.fillStyle = 'rgba(180, 220, 255, 1)';
        ctx.globalAlpha = flashAlpha;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        flashAlpha *= 0.50;  // halve each frame → gone in ~3 frames
      }
      // Bolt paths
      for (let i = lightnings.length - 1; i >= 0; i--) {
        const lt = lightnings[i];
        drawLightning(lt);
        lt.life++;
        if (lt.life >= lt.max) lightnings.splice(i, 1);
      }

      // 1 ── Crescent Moon
      drawMoon();

      // 2 ── Clouds (drift & wrap)
      for (const c of clouds) {
        drawCloud(c);
        c.x += c.spd;
        if (c.x - c.rx > canvas.width) c.x = -c.rx;
      }

      // 3 ── Twinkling Stars (horizon fade)
      for (const s of stars) {
        let a = s.base;
        if (s.twinkle) {
          a += Math.sin(frame * s.spd + s.phase) * s.amp;
          a = Math.max(0, Math.min(1, a));
        }
        a *= hA(s.y);
        if (a <= 0.004) continue; // skip invisible stars
        ctx.globalAlpha = a;
        ctx.fillStyle = 'white';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // 4 ── Meteor Shower (frequent: every 80–180 frames)
      mTimer++;
      if (mTimer >= Math.floor(rB(5, 20))) { spawnMeteor(); mTimer = 0; }
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        drawMeteor(m);
        m.x += m.vx; m.y += m.vy; m.life++;
        if (m.life >= m.max || m.y - m.len > canvas.height) meteors.splice(i, 1);
      }

      // 5 ── Stardust Mouse Trail (additive 'lighter' blend)
      drawDusts();
      for (let i = dusts.length - 1; i >= 0; i--) {
        const d = dusts[i];
        d.x += d.vx; d.y += d.vy;
        d.vy *= 0.95; // decelerate upward drift
        d.life++;
        if (d.life >= d.max) dusts.splice(i, 1);
      }
    };

    loop();
  }
  // ──────────────────────────────────────────────────────────────────────────

  onLogin() {
    const credentials = { Username: this.Username, Password: this.Password };

    this.LoginService.login(credentials).subscribe({
      next: (res: any) => this.handleLoginSuccess(res),
      error: (err: any) => {
        if (err.status === 409 && err.error?.status === 'SESSION_ACTIVE') {
          // Another session is active — show the force-logout confirmation modal
          this.showForceModal = true;
          this.errorMessage = '';
        } else {
          this.errorMessage = 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง';
        }
        console.error('Login error:', err);
      }
    });
  }

  // Called when user clicks 'Yes' in the Force-Login modal
  onConfirmForceLogin() {
    if (this.isForceLogging) return;  // Guard: prevent double-click
    this.isForceLogging = true;
    this.showForceModal = false;

    const credentials = { Username: this.Username, Password: this.Password, ConfirmForce: true };

    this.LoginService.login(credentials).subscribe({
      next: (res: any) => {
        this.isForceLogging = false;
        this.handleLoginSuccess(res);
      },
      error: (err: any) => {
        this.isForceLogging = false;
        this.errorMessage = 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
        console.error('Force login error:', err);
      }
    });
  }

  onCancelForceLogin() {
    this.showForceModal = false;
  }

  private handleLoginSuccess(res: any) {
    if (res.token && res.user?.Role) {
      sessionStorage.setItem('token', res.token);
      sessionStorage.setItem('role', res.user.Role);
      sessionStorage.setItem('user', JSON.stringify(res.user));

      // Store SessionToken for Heartbeat integrity checks
      if (res.sessionToken) {
        sessionStorage.setItem('sessionToken', res.sessionToken);
      }

      this.heartbeatService.startHeartbeat(res.user.Employee_ID);
      this.notificationService.refreshSession();

      switch (res.user.Role) {
        case 'view':
          this.router.navigate(['/production/PlanList']);
          break;
        case 'Cost':
          this.router.navigate(['/purchase/analyze']);
          break;
        case 'production':
          this.router.navigate(['/production/request']);
          break;
        case 'engineer':
          this.router.navigate(['/production/PlanList']);
          break;
        case 'purchase':
          this.router.navigate(['/purchase/PlanList']);
          break;
        case 'PC':
          this.router.navigate(['/production/PCPlan']);
          break;
        case 'QC':
        case 'Gague':
          this.router.navigate(['/production/PlanList']);
          break;
        case 'admin':
          this.router.navigate(['/purchase/detail']);
          window.open('/production/request', '_blank');
          break;
        default:
          this.errorMessage = 'User access denied';
      }
    } else {
      this.errorMessage = 'Invalid login response';
    }
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }
}
// console.log()