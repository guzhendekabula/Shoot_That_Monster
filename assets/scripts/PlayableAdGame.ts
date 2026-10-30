import {
  _decorator, Component, Node, UITransform, Graphics, Color, Vec3, Vec2,
  Label, RichText, Sprite, SpriteFrame, Texture2D, Rect, resources, BlockInputEvents,
  JsonAsset, AudioClip, AudioSource, view, Input, input, EventTouch, EventMouse, tween,
} from 'cc';
const { ccclass, property } = _decorator;

type WeaponId = 'knife' | 'handgun' | 'rifle' | 'shotgun';
type PetId = 'fox' | 'frog' | 'dragonling' | 'squirrel';
type Difficulty = 'easy' | 'normal' | 'hard';
type PickupKind = 'coin' | 'xp' | 'heart' | WeaponId;
type Anim = { node: Node; sprite: Sprite; frames: SpriteFrame[]; fps: number; clock: number; index?: number };
type EnemyKind = 'mushroom' | 'eye' | 'bat' | 'plant' | 'boss';
type Enemy = { node: Node; sprite: Sprite; fallback: Node; hp: number; maxHp: number; speed: number; damage: number; attackCd: number; specialCd?: number; radius: number; boss: boolean; kind: EnemyKind; indestructible: boolean; anim?: Anim; idleFrames?: SpriteFrame[]; attackFrames?: SpriteFrame[]; walkFrames?: SpriteFrame[]; bossDirectionRow?: number; attackRemaining: number; alive: boolean };
type EnemyProjectile = { node: Node; direction: Vec2; speed: number; remaining: number; damage: number; hitRadius?: number; magic?: boolean };
type ShotgunPellet = { node: Node; direction: Vec2; travelled: number; range: number; speed: number };
type ShotgunBlast = { origin: Vec2; forward: Vec2; edge: number; travelled: number; range: number; speed: number; multiplier: number; damage: number | null; hit: Set<Enemy> };
type Pickup = { node: Node; sprite: Sprite; fallback: Node; kind: PickupKind; amount: number; taken: boolean; baseY: number; bobPhase: number; anim?: Anim };
type Pet = { id: PetId; node: Node; sprite: Sprite; fallback: Node; anim?: Anim; attackCd: number };
type EnemyFrames = { idle: SpriteFrame[]; walk: SpriteFrame[]; attack: SpriteFrame[] };

const W: Record<WeaponId, { name: string; damage: number; interval: number; range: number; color: Color; melee: boolean; minDamage?: number; pelletCount?: number; spreadDegrees?: number }> = {
  knife: { name: '小刀', damage: 9, interval: 0.48, range: 62, color: new Color(255, 220, 130), melee: true },
  handgun: { name: '手枪', damage: 2, interval: 0.2, range: 200, color: new Color(255, 226, 108), melee: false },
  rifle: { name: '步枪', damage: 15, interval: 0.5, range: 350, color: new Color(255, 90, 115), melee: false },
  shotgun: { name: '霰弹枪', damage: 100, minDamage: 1, interval: 2, range: 200, pelletCount: 5, spreadDegrees: 48, color: new Color(255, 170, 85), melee: false },
};
const DIFF: Record<Difficulty, { name: string; hp: number; speed: number; damage: number; bossHp: number; bossDamage: number; bossSpeed: number; bossProjectileSpeed: number }> = {
  // Normal monster HP is calibrated against the starting knife's 9 damage:
  // easy = 1 hit, normal = 1.5 hits, hard = 2 hits (before XP/evolution bonuses).
  easy: { name: '简单', hp: 1, speed: 0.85, damage: 0.75, bossHp: 0.8, bossDamage: 0.8, bossSpeed: 100, bossProjectileSpeed: 150 },
  normal: { name: '中等', hp: 1.5, speed: 1, damage: 1, bossHp: 1, bossDamage: 1, bossSpeed: 175, bossProjectileSpeed: 200 },
  hard: { name: '困难', hp: 2, speed: 1.15, damage: 1.25, bossHp: 1.4, bossDamage: 1.3, bossSpeed: 250, bossProjectileSpeed: 250 },
};
const MAX_GOLD = 100;
const MAX_LEVEL = 10;

@ccclass('PlayableAdGame')
export class PlayableAdGame extends Component {
  @property({ tooltip: '自动加载项目中 assets/resources/game/audio/bgm.mp3' }) playBgm = true;

  private root!: Node; private world!: Node; private ui!: Node; private player!: Node; private playerVisual!: Node; private playerSprite!: Sprite; private playerFallback!: Node; private playerFeetSprite!: Sprite; private playerFeetFallback!: Node;
  private hud: Record<string, Label> = {}; private enemies: Enemy[] = []; private enemyProjectiles: EnemyProjectile[] = []; private pickups: Pickup[] = []; private pets: Pet[] = [];
  private animations: Anim[] = [];
  private shotgunPellets: ShotgunPellet[] = [];
  private shotgunBlasts: ShotgunBlast[] = [];
  private pendingShotgunDelay: number | null = null;
  private hitFlashing = new Set<Node>();
  private survivorFrames = new Map<string, SpriteFrame[]>(); private feetIdleFrames: SpriteFrame[] = []; private feetRunFrames: SpriteFrame[] = [];
  private petEffectFrames = new Map<PetId, SpriteFrame[]>();
  private petFrames = new Map<PetId, SpriteFrame[]>();
  private enemyFrames = new Map<EnemyKind, EnemyFrames>();
  private bossWalkFrames: SpriteFrame[] = []; private bossAttackFrames: SpriteFrame[] = [];
  private initialResourcesReady = false; private initialLoadAttempt = 0; private sceneVersion = 0;
  private petResourcesReady = false; private bossResourcesReady = false;
  private petResourceTask: Promise<void> | null = null; private bossResourceTask: Promise<void> | null = null;
  private pickupFrames = new Map<PickupKind, SpriteFrame[]>();
  private chestFrames: SpriteFrame[] = []; private chestSprites: Sprite[] = []; private chestFallbacks: Node[] = [];
  private gunTracerFrames: SpriteFrame[] = []; private gunImpactFrames: SpriteFrame[] = []; private muzzleFrames: SpriteFrame[] = [];
  private playerBodyAnim: Anim | null = null; private playerFeetAnim: Anim | null = null; private playerActionRemaining = 0;
  private audioSource!: AudioSource; private bgmSource!: AudioSource; private bossWarningLoopSource!: AudioSource; private bossRoarLoopSource!: AudioSource; private bgm: AudioClip | null = null; private sfx: Record<string, AudioClip> = {};
  private screenW = 1280; private screenH = 720; private worldW = 3200; private worldH = 1780;
  private mapBackgroundTexture: Texture2D | null = null; private mapBackgroundSprites: Sprite[] = [];
  private move = new Vec2(); private touchOrigin = new Vec2(); private moveTouch = -1; private pointerDown = false;
  private facingAngle = 0;
  private petFacingLeft = false;
  private petEdgeX: -1|0|1 = 0; private petEdgeY: -1|0|1 = 0;
  private paused = true; private state: 'loading' | 'menu' | 'playing' | 'result' = 'loading'; private difficulty: Difficulty = 'normal';
  private hp = 100; private maxHp = 100; private gold = 0; private xpCount = 0; private evolution = 0;
  private owned: WeaponId[] = ['knife']; private weapon: WeaponId = 'knife';
  private attackTimer = 0; private spawnTimer = 0; private elapsed = 0; private bossCountdown = -1; private bossSpawned = false;
  private wave = 0; private maxEnemies = 22; private chestIndex = 0; private chestGold = [30, 60]; private chestNodes: Node[] = [];
  private modal: Node | null = null; private message = ''; private messageTime = 0; private muted = false; private wasBgmStarted = false; private bgmSuppressedForBoss = false; private bossAudioActive = false;
  private bossBar: Graphics | null = null; private bossBarNode: Node | null = null;
  private evolutionLabel: Label | null = null;
  private muteIcon: Graphics | null = null; private quickWeaponSlots = new Map<WeaponId, { node: Node; sprite: Sprite; panel: Graphics; label: Label }>(); private quickbarState = '';
  private joystickKnob: Node | null = null; private chestGuideMarker: Node | null = null; private chestGuideLabel: Label | null = null;
  private loadingSpinner: Node | null = null; private loadingElapsed = 0;
  private secondChestGuideElapsed = 0;

  // Normalized coordinates (top-left origin) of water on OutdoorSampleMap.
  // Spawning uses the same stretched full-map coordinates as OutdoorMap.
  private readonly waterPolygons: number[][][] = [
    [[.415,.335],[.435,.325],[.535,.325],[.545,.285],[.555,.235],[.665,.225],[.695,.245],[.708,.295],[.712,.565],[.702,.605],[.675,.625],[.625,.625],[.615,.685],[.605,.735],[.615,.805],[.605,.865],[.525,.875],[.515,.815],[.485,.795],[.455,.785],[.415,.775],[.402,.735],[.402,.625],[.412,.575],[.425,.535],[.412,.505],[.405,.475],[.405,.375]],
    [[.955,.155],[1,.155],[1,.535],[.955,.535]],
  ];

  onLoad() {
    console.info('[PlayableAdGame] onLoad：游戏脚本已启动，节点 =', this.node.name);
    const visible = view.getVisibleSize(); this.screenW = Math.max(900, visible.width); this.screenH = Math.max(560, visible.height);
    this.worldW = Math.max(this.screenW * 2.65, 2800); this.worldH = this.worldW * 510 / 918;
    const tr = this.getComponent(UITransform) || this.addComponent(UITransform); tr.setContentSize(this.screenW, this.screenH);
    this.root = this.node;
    // Keep the scene's Camera and any editor-authored nodes. Only clear nodes
    // created by this component if the scene is re-entered or reloaded.
    for (const child of [...this.root.children]) {
      if (child.name === 'World' || child.name === 'UI') child.removeFromParent();
    }
    this.world = this.makeNode('World', this.root, 0, 0, this.screenW, this.screenH);
    this.ui = this.makeNode('UI', this.root, 0, 0, this.screenW, this.screenH);
    this.audioSource = this.getComponent(AudioSource) || this.addComponent(AudioSource);
    const getAudioSource=(name:string)=>{let n=this.node.getChildByName(name);if(!n){n=new Node(name);n.setParent(this.node);}const source=n.getComponent(AudioSource)||n.addComponent(AudioSource);source.playOnAwake=false;source.stop();return source;};
    this.bgmSource=getAudioSource('BackgroundMusic');this.bossWarningLoopSource=getAudioSource('BossWarningLoop');this.bossRoarLoopSource=getAudioSource('BossRoarLoop');
    void this.loadInitialResources();
    input.on(Input.EventType.TOUCH_START, this.onTouchStart, this); input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this); input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this); input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this); input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this); input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
  }
  onDestroy() {
    this.initialLoadAttempt++;this.sceneVersion++;
    input.off(Input.EventType.TOUCH_START, this.onTouchStart, this); input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this); input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this); input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this); input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this); input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
  }
  update(dt: number) {
    if (this.messageTime > 0) { this.messageTime -= dt; if (this.messageTime <= 0 && this.hud.message) this.hud.message.string = ''; }
    if(this.state==='loading'){this.loadingElapsed+=dt;this.loadingSpinner?.setRotationFromEuler(0,0,this.loadingElapsed*220);return;}
    if (this.state !== 'playing' || this.paused) return;
    if (this.playerActionRemaining > 0) { this.playerActionRemaining = Math.max(0, this.playerActionRemaining - dt); if (this.playerActionRemaining === 0) this.setPlayerLocomotion(this.move.length() > .08); }
    this.elapsed += dt; this.spawnTimer -= dt; this.attackTimer -= dt;
    this.movePlayer(dt); this.followPlayerCamera(); this.updatePlayerFacing(); this.updateChestGuide(dt); this.moveEnemies(dt); if(this.state!=='playing')return; this.moveEnemyProjectiles(dt); if(this.state!=='playing')return;
    this.moveShotgunPellets(dt);if(this.state!=='playing')return;
    this.updatePendingShotgun(dt);
    this.updatePets(dt); this.updatePickups(dt); this.updateChests(dt); if(this.paused||this.state!=='playing'){this.refreshHud();return;}
    this.updateBossCountdown(dt); this.autoAttack(); if(this.state!=='playing')return; this.animate(dt); this.refreshHud();
  }
  private makeNode(name: string, parent: Node, x: number, y: number, w: number, h: number): Node {
    const n = new Node(name); n.setParent(parent); n.setPosition(x, y, 0); n.addComponent(UITransform).setContentSize(w, h); return n;
  }
  private addGraphics(n: Node, draw: (g: Graphics) => void) { const g = n.addComponent(Graphics); draw(g); return g; }
  private label(parent: Node, text: string, x: number, y: number, size = 20, color = Color.WHITE, w = 300, h = 36): Label {
    const n = this.makeNode('Label', parent, x, y, w, h); const l = n.addComponent(Label); l.string = text; l.fontSize = size; l.lineHeight = size + 6; l.color = color; l.horizontalAlign = Label.HorizontalAlign.CENTER; l.verticalAlign = Label.VerticalAlign.CENTER; return l;
  }
  private richLabel(parent: Node, text: string, x: number, y: number, size = 20, color = Color.WHITE, w = 300, h = 36) {
    const n = this.makeNode('RichLabel', parent, x, y, w, h); const l = n.addComponent(RichText); l.string = `<color=${color.toHEX()}>${text}</color>`; l.fontSize = size; l.lineHeight = size + 6; l.maxWidth = w; l.horizontalAlign = Label.HorizontalAlign.CENTER; return l;
  }
  private panel(parent: Node, x: number, y: number, w: number, h: number, fill = new Color(16, 25, 38, 225), stroke = new Color(112, 211, 204)) {
    const n = this.makeNode('Panel', parent, x, y, w, h); this.addGraphics(n, g => { g.fillColor = fill; g.roundRect(-w/2, -h/2, w, h, 14); g.fill(); g.strokeColor = stroke; g.lineWidth = 2; g.roundRect(-w/2, -h/2, w, h, 14); g.stroke(); }); return n;
  }
  private button(parent: Node, text: string, x: number, y: number, w: number, h: number, action: () => void, fill = new Color(28, 160, 142)) {
    const n = this.panel(parent, x, y, w, h, fill, new Color(195, 255, 232)); n.name = `Button_${text}`; this.label(n, text, 0, 0, 22, Color.WHITE, w-14, h-6);
    // Cocos may deliver both touch-end and synthesized mouse-up for one browser
    // click. Deduplicate them so toggles and menu actions only run once.
    let lastActivation = 0;
    const activate = (e: EventTouch | EventMouse) => {
      e.propagationStopped = true;
      const now = Date.now();
      if (now - lastActivation < 180) return;
      lastActivation = now;
      action();
    };
    n.on(Node.EventType.TOUCH_END, activate, this);
    n.on(Node.EventType.MOUSE_UP, activate, this); return n;
  }
  private bindActivation(node: Node, action: () => void) {
    let lastActivation = 0;
    const activate = (e: EventTouch | EventMouse) => { e.propagationStopped = true; const now = Date.now(); if (now-lastActivation<180) return; lastActivation=now; action(); };
    node.on(Node.EventType.TOUCH_END, activate, this); node.on(Node.EventType.MOUSE_UP, activate, this);
  }
  private clearScene() { this.sceneVersion++; this.world.setPosition(0,0,0); this.world.removeAllChildren(); this.ui.removeAllChildren(); this.loadingSpinner=null; this.enemies = []; this.enemyProjectiles=[]; this.shotgunPellets=[]; this.shotgunBlasts=[]; this.pendingShotgunDelay=null; this.pickups = []; this.pets = []; this.animations = []; this.playerBodyAnim = null; this.playerFeetAnim = null; this.playerActionRemaining = 0; this.hud = {}; this.quickWeaponSlots.clear(); this.quickbarState=''; this.muteIcon=null; this.evolutionLabel=null; this.chestNodes = []; this.chestSprites=[]; this.chestFallbacks=[]; this.chestGuideMarker=null; this.chestGuideLabel=null; this.secondChestGuideElapsed=0; this.modal = null; }
  private drawLoadingScreen(message='努力加载中…') {
    this.state='loading';this.loadingElapsed=0;this.clearScene();
    const bg=this.makeNode('LoadingBackdrop',this.world,0,0,this.screenW,this.screenH);
    this.addGraphics(bg,g=>{g.fillColor=new Color(20,34,48);g.rect(-this.screenW/2,-this.screenH/2,this.screenW,this.screenH);g.fill();});
    if(message.indexOf('失败')<0){
      this.loadingSpinner=this.makeNode('LoadingSpinner',this.ui,0,22,64,64);
      this.addGraphics(this.loadingSpinner,g=>{for(let i=0;i<8;i++){const a=i*Math.PI/4;g.fillColor=new Color(144,231,209,70+i*22);g.circle(Math.cos(a)*23,Math.sin(a)*23,4);g.fill();}});
    }
    this.label(this.ui,message,0,-34,20,new Color(223,240,239),500,38);
  }
  private helpRules(){
    return [
      '移动：拖动人物左下角摇杆；角色会自动攻击附近敌人。',
      '成长：击败敌人收集金币、经验球和爱心；经验球提升全武器与宠物攻击。',
      '宝箱：第一个需要 30 金币，第二个需要 60 金币；靠近后自动开启并暂停战斗。',
      '奖励：选择完第二个宝箱的宠物，Boss 在 10 秒后到达战场。',
      '武器：开局装备小刀；拾取后点击底部快捷栏切换，右下角可查看武器详情。',
      '特殊怪：蝙蝠会远程攻击；食人花固定不动，无法击杀，靠近会咬人。',
    ];
  }
  private drawHelpBoard(){
    const w=Math.min(1020,this.screenW-40);
    const originalH=Math.min(510,this.screenH*.72);
    const extraMargin=24;
    const top=this.screenH*.07+originalH/2+extraMargin;
    const bottom=-this.screenH*.41-37-extraMargin;
    const h=top-bottom,y=(top+bottom)/2;
    const board=this.makeNode('HelpNoticeBoard',this.ui,0,y,w,h);
    this.addGraphics(board,g=>{
      // Dark timber frame and warm inset planks, drawn to match the pixel-art map.
      g.fillColor=new Color(48,29,17,245);g.roundRect(-w/2,-h/2,w,h,20);g.fill();
      g.fillColor=new Color(116,70,36,250);g.roundRect(-w/2+9,-h/2+9,w-18,h-18,14);g.fill();
      g.fillColor=new Color(145,91,48,245);g.roundRect(-w/2+17,-h/2+17,w-34,h-34,10);g.fill();
      g.fillColor=new Color(106,62,32,110);
      for(let row=-2;row<=2;row++){
        const plankY=row*h*.145;
        g.rect(-w/2+24,plankY,w-48,2);g.fill();
      }
      g.strokeColor=new Color(211,164,99,235);g.lineWidth=3;g.roundRect(-w/2+13,-h/2+13,w-26,h-26,12);g.stroke();
      for(const x of [-w/2+32,w/2-32])for(const py of [-h/2+32,h/2-32]){
        g.fillColor=new Color(230,192,126);g.circle(x,py,5);g.fill();
        g.fillColor=new Color(91,54,29);g.circle(x,py,2);g.fill();
      }
    });
  }
  private drawMenu() {
    if(!this.initialResourcesReady)return;
    this.stopBossAudio();
    // A replay can return here before the victory/failure audio callback runs.
    // Clear the boss-only BGM suppression so the menu can start the music again.
    this.bgmSuppressedForBoss=false;
    this.state = 'menu'; this.paused = true; this.clearScene(); this.drawBackdrop(); this.drawHelpBoard();
    this.label(this.ui, '向怪兽开炮 · 新手指引', 0, this.screenH*0.34, 42, new Color(255, 225, 148), 720, 62);
    this.richLabel(this.ui, '目标：收集金币开启两只宝箱，选择宠物并击败 <color=#ff5d5d>Boss</color>', 0, this.screenH*0.24, 21, new Color(255, 238, 207), 900, 38);
    const rules=this.helpRules();
    rules.forEach((text,i)=>{
      const line=`• ${text}`.replace('Boss','<color=#ff5d5d>Boss</color>');
      const y=this.screenH*0.13-i*34,w=Math.min(930,this.screenW-50);
      if(line.includes('<color='))this.richLabel(this.ui,line,0,y,16,new Color(255,236,201),w,30);
      else this.label(this.ui,line,0,y,16,new Color(255,236,201),w,30);
    });
    this.label(this.ui,'选择难度',0,-this.screenH*0.18,19,new Color(255, 225, 148),300,32);
    const choices: Difficulty[] = ['easy', 'normal', 'hard']; const startX = -220;
    choices.forEach((d, i) => this.button(this.ui, DIFF[d].name, startX + i*220, -this.screenH*0.27, 180, 54, () => { this.difficulty = d; this.drawMenu(); }, d === this.difficulty ? new Color(26, 137, 117) : new Color(48, 64, 79)));
    this.button(this.ui,'开始游戏',0,-this.screenH*0.41,240,58,()=>this.startGame(),new Color(35,145,116));
    this.makeMuteButton(); this.startBgm();
  }
  private startGame() {
    if(!this.initialResourcesReady||this.state==='loading')return;
    this.stopBossAudio();
    this.bossAudioActive=false;
    this.clearScene(); this.state = 'playing'; this.paused = false; this.hp = 100; this.maxHp = 100; this.gold = 0; this.xpCount = 0; this.evolution = 0; this.owned = ['knife']; this.weapon = 'knife'; this.attackTimer = 0; this.spawnTimer = 1.5; this.elapsed = 0; this.bossCountdown = -1; this.bossSpawned = false; this.bgmSuppressedForBoss=false; this.wave = 0; this.chestIndex = 0; this.move.set(0,0); this.facingAngle=0; this.petFacingLeft=false; this.petEdgeX=0; this.petEdgeY=0;
    this.drawBackdrop(); this.makePlayer(); this.makeHud(); this.placeChests(); this.placePickups(); this.refreshHud(); this.updateChestGuide();
    this.startBgm();
    this.showMessage('拖动屏幕移动，靠近宝箱花金币升级');
  }
  private get playerLevel(){return Math.min(MAX_LEVEL,1+this.xpCount);}
  private drawBackdrop() {
    this.mapBackgroundSprites = [];
    const fallback = this.makeNode('MapFallback', this.world, 0, 0, this.worldW, this.worldH);
    this.addGraphics(fallback, g => { g.fillColor = new Color(93, 151, 58); g.rect(-this.worldW/2,-this.worldH/2,this.worldW,this.worldH); g.fill(); });
    const mapNode=this.makeNode('OutdoorMap',this.world,0,0,this.worldW,this.worldH);const sprite=mapNode.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;this.mapBackgroundSprites.push(sprite);
    if(this.mapBackgroundTexture)this.applyMapTexture(sprite,this.mapBackgroundTexture);
  }
  private applyMapTexture(sprite:Sprite,tex:Texture2D){tex.setFilters(Texture2D.Filter.NEAREST,Texture2D.Filter.NEAREST);sprite.spriteFrame=this.frame(tex,{x:0,y:0,w:tex.width,h:tex.height});}
  private followPlayerCamera(){if(!this.player||!this.world)return;const p=this.player.position;const cx=Math.max(-this.worldW/2+this.screenW/2,Math.min(this.worldW/2-this.screenW/2,p.x));const cy=Math.max(-this.worldH/2+this.screenH/2,Math.min(this.worldH/2-this.screenH/2,p.y));this.world.setPosition(-cx,-cy,0);}
  private makePlayer() {
    this.player = this.makeNode('Player', this.world, 0, 0, 80, 64);
    this.playerVisual = this.makeNode('SurvivorVisual', this.player, 0, 0, 80, 64);
    const feetNode = this.makeNode('Feet', this.playerVisual, 0, -15, 80, 48); feetNode.setScale(.31,.31,1); this.playerFeetSprite = feetNode.addComponent(Sprite); this.playerFeetSprite.sizeMode = Sprite.SizeMode.TRIMMED;
    this.playerFeetFallback = this.makeNode('FeetFallback', feetNode, 0, 0, 42, 20); this.addGraphics(this.playerFeetFallback, g => { g.fillColor = new Color(45, 48, 56); g.ellipse(-9, 0, 8, 4); g.ellipse(9, 0, 8, 4); g.fill(); });
    const bodyNode = this.makeNode('Body', this.playerVisual, 0, 0, 80, 64); bodyNode.setScale(.31,.31,1); this.playerSprite = bodyNode.addComponent(Sprite); this.playerSprite.sizeMode = Sprite.SizeMode.TRIMMED;
    this.playerFallback = this.makeNode('Fallback', bodyNode, 0, 0, 52, 42); this.addGraphics(this.playerFallback, g => { g.fillColor = new Color(95, 102, 80); g.ellipse(0, 0, 25, 17); g.fill(); g.fillColor = new Color(212, 176, 144); g.circle(7, 3, 9); g.fill(); });
    this.loadPlayerFrames();
  }
  private makeHud() {
    const topWidth=Math.min(980,this.screenW-300);
    const fontScale=Math.min(1,topWidth/850);
    const top = this.panel(this.ui, 0, this.screenH/2-42, topWidth, 68, new Color(13,24,38,150));
    this.hud.hp = this.label(top, '', -topWidth*.38, 0, Math.max(12,18*fontScale), new Color(255,147,151), topWidth*.20);
    this.hud.gold = this.label(top, '', -topWidth*.19, 0, Math.max(12,18*fontScale), new Color(255,224,120), topWidth*.13);
    this.hud.weapon = this.label(top, '', -topWidth*.045, 0, Math.max(12,18*fontScale), Color.WHITE, topWidth*.14);
    this.hud.xp = this.label(top, '', topWidth*.135, 0, Math.max(11,15*fontScale), new Color(170,230,255), topWidth*.20);
    this.hud.difficulty = this.label(top, '', topWidth*.34, 0, Math.max(11,14*fontScale), new Color(255,220,150), topWidth*.12);
    this.hud.stage = this.label(top, '', topWidth*.455, 0, Math.max(11,13*fontScale), new Color(208,240,207), topWidth*.09);
    this.hud.message = this.label(this.ui, '', 0, this.screenH*0.35, 19, new Color(255,240,185), 760, 42);
    this.chestGuideLabel=this.label(this.ui,'',0,this.screenH*0.29,16,new Color(255,232,151),520,32);
    this.chestGuideMarker=this.makeNode('ChestGuideArrow',this.ui,0,0,36,36);
    this.addGraphics(this.chestGuideMarker,g=>{g.fillColor=new Color(255,213,105);g.moveTo(15,0);g.lineTo(-10,10);g.lineTo(-5,0);g.lineTo(-10,-10);g.close();g.fill();g.strokeColor=new Color(255,255,225);g.lineWidth=2;g.moveTo(15,0);g.lineTo(-10,10);g.lineTo(-5,0);g.lineTo(-10,-10);g.close();g.stroke();});
    this.chestGuideMarker.active=false;
    this.hud.boss = this.label(this.ui, '', 0, -this.screenH/2+120, 24, new Color(255,120,110), 460, 42);
    this.bossBarNode=this.makeNode('BossHealthBar',this.ui,0,this.screenH/2-100,380,18);this.bossBar=this.addGraphics(this.bossBarNode,g=>{g.fillColor=new Color(35,37,46,225);g.roundRect(-190,-9,380,18,8);g.fill();});this.bossBarNode.active=false;
    this.makeMuteButton();
    const pauseButton=this.makeNode('PauseButton',this.ui,this.screenW/2-104,this.screenH/2-44,52,48);
    this.addGraphics(pauseButton,g=>{
      g.fillColor=new Color(24,43,57,235);g.roundRect(-26,-24,52,48,12);g.fill();
      g.strokeColor=new Color(139,218,221);g.lineWidth=2;g.roundRect(-26,-24,52,48,12);g.stroke();
      g.fillColor=Color.WHITE;g.roundRect(-11,-12,7,24,2);g.roundRect(4,-12,7,24,2);g.fill();
    });
    this.bindActivation(pauseButton,()=>this.showPauseHelp());
    this.drawWeaponQuickbar();
    this.button(this.ui,'武器详情',this.screenW/2-104,-this.screenH/2+84,160,56,()=>this.showWeaponDetails(),new Color(38,101,151));
    this.drawJoystick();
  }
  private makeMuteButton(){
    const muteButton=this.makeNode('MuteButton',this.ui,this.screenW/2-42,this.screenH/2-44,52,48);
    this.muteIcon=this.addGraphics(muteButton,g=>{});this.drawMuteIcon();
    this.bindActivation(muteButton,()=>{
      this.muted=!this.muted;
      if(this.bgmSource?.isValid)this.bgmSource.volume=this.muted?0:.35;
      if(!this.muted){this.startBgm();this.setBossAudioVolume(1);if(this.bossAudioActive)this.startBossAudio();}
      else this.setBossAudioVolume(0);
      this.drawMuteIcon();
      if(this.state==='playing')this.showMessage(this.muted?'声音已关闭':'声音已开启');
    });
  }
  private showPauseHelp(){
    if(this.state!=='playing'||this.paused||this.modal)return;
    this.resetJoystick();this.moveTouch=-1;this.paused=true;
    const card=this.makeModal('游戏暂停 · 玩法帮助','战斗已暂停，阅读后点击继续游戏',500,860);
    const width=Math.min(860,this.screenW-40);
    this.richLabel(card,'目标：收集金币开启两只宝箱，选择宠物并击败 <color=#ff5d5d>Boss</color>',0,112,16,new Color(255,227,158),width-60,30);
    this.helpRules().forEach((text,i)=>{
      if(text.includes('Boss')){
        const label=this.richLabel(card,`• ${text.replace(/Boss/g,'<color=#ff5d5d>Boss</color>')}`,0,66-i*38,14,new Color(228,238,240),width-64,36);
        label.horizontalAlign=Label.HorizontalAlign.CENTER;label.lineHeight=18;
        return;
      }
      const label=this.label(card,`• ${text}`,0,66-i*38,14,new Color(228,238,240),width-64,36);
      label.horizontalAlign=Label.HorizontalAlign.LEFT;label.lineHeight=18;
    });
    const buttonWidth=Math.min(200,(width-80)/3),step=buttonWidth+20;
    this.button(card,'继续游戏',-step,-198,buttonWidth,48,()=>this.closeModal(),new Color(35,145,116));
    this.button(card,'重新开始',0,-198,buttonWidth,48,()=>{
      this.resetJoystick();this.moveTouch=-1;this.startGame();
    },new Color(38,101,151));
    this.button(card,'回到主菜单',step,-198,buttonWidth,48,()=>{
      this.resetJoystick();this.moveTouch=-1;this.drawMenu();
    },new Color(86,91,113));
  }
  private drawMuteIcon(){
    const g=this.muteIcon;if(!g?.isValid)return;g.clear();g.fillColor=new Color(24,43,57,235);g.roundRect(-26,-24,52,48,12);g.fill();g.strokeColor=new Color(139,218,221);g.lineWidth=2;g.roundRect(-26,-24,52,48,12);g.stroke();
    g.fillColor=Color.WHITE;g.moveTo(-16,-6);g.lineTo(-9,-6);g.lineTo(1,-14);g.lineTo(1,14);g.lineTo(-9,6);g.lineTo(-16,6);g.close();g.fill();g.strokeColor=Color.WHITE;g.lineWidth=2;
    if(this.muted){g.moveTo(7,-10);g.lineTo(20,10);g.moveTo(20,-10);g.lineTo(7,10);g.stroke();}
    else{g.moveTo(6,-7);g.lineTo(10,-4);g.lineTo(10,4);g.lineTo(6,7);g.stroke();g.moveTo(12,-12);g.lineTo(18,-7);g.lineTo(18,7);g.lineTo(12,12);g.stroke();}
  }
  private drawWeaponQuickbar(){
    const ids:WeaponId[]=['knife','handgun','rifle','shotgun'];
    ids.forEach((id,i)=>{
      const x=(i-1.5)*82,y=-this.screenH/2+42;const node=this.makeNode(`WeaponSlot_${id}`,this.ui,x,y,76,66);
      const panel=this.addGraphics(node,g=>{});const iconNode=this.makeNode(`WeaponIcon_${id}`,node,0,7,44,34);const sprite=iconNode.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;const frames=this.pickupFrames.get(id);if(frames?.length)sprite.spriteFrame=frames[0];
      const name=this.label(node,W[id].name,0,-22,12,new Color(228,238,240),68,20);name.horizontalAlign=Label.HorizontalAlign.CENTER;
      this.label(node,`${i+1}`, -29,24,11,new Color(200,220,225),18,16);
      this.quickWeaponSlots.set(id,{node,sprite,panel,label:name});
      this.bindActivation(node,()=>{if(this.state!=='playing'||this.paused||this.owned.indexOf(id)<0)return;if(this.weapon!==id){this.weapon=id;this.setPlayerLocomotion(this.move.length()>.08);this.showMessage(`切换至${W[id].name}`);this.refreshHud();}});
    });
    this.refreshWeaponQuickbar(true);
  }
  private refreshWeaponQuickbar(force=false){
    const state=`${this.weapon}|${this.owned.join(',')}`;if(!force&&state===this.quickbarState)return;this.quickbarState=state;
    this.quickWeaponSlots.forEach((slot,id)=>{const unlocked=this.owned.indexOf(id)>=0;slot.panel.clear();slot.panel.fillColor=this.weapon===id?new Color(31,127,106,245):unlocked?new Color(24,43,57,230):new Color(36,43,49,205);slot.panel.roundRect(-38,-33,76,66,10);slot.panel.fill();slot.panel.strokeColor=this.weapon===id?new Color(255,220,123):unlocked?new Color(128,196,197):new Color(83,94,99);slot.panel.lineWidth=this.weapon===id?3:2;slot.panel.roundRect(-38,-33,76,66,10);slot.panel.stroke();slot.sprite.color=unlocked?Color.WHITE:new Color(82,88,90);slot.label.color=unlocked?new Color(228,238,240):new Color(115,122,125);});
  }
  private weaponDamageMultiplier(){return (1+this.xpCount*.05)*(1+this.evolution*.12);}
  private showWeaponDetails(){
    if(this.state!=='playing'||this.paused||this.modal)return;
    this.resetJoystick();this.moveTouch=-1;this.paused=true;
    const card=this.makeModal('武器详情','查看期间战斗暂停 · 当前伤害已计入本局成长',400);
    const heading=new Color(255,227,158);
    this.label(card,'武器 / 状态',-195,66,14,heading,136,24);
    this.label(card,'基础 / 当前伤害',-65,66,14,heading,136,24);
    this.label(card,'攻速（次/秒）',75,66,14,heading,132,24);
    this.label(card,'攻击距离',210,66,14,heading,96,24);
    const multiplier=this.weaponDamageMultiplier();
    const ids:WeaponId[]=['knife','handgun','rifle','shotgun'];
    ids.forEach((id,i)=>{
      const def=W[id],y=30-i*34;
      const unlocked=this.owned.indexOf(id)>=0;
      const color=unlocked?new Color(228,238,240):new Color(156,170,181);
      const icon=this.makeNode(`WeaponDetailIcon_${id}`,card,-269,y,28,24);
      const sprite=icon.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;
      const frames=this.pickupFrames.get(id);if(frames?.length)sprite.spriteFrame=frames[0];sprite.color=color;
      const status=this.weapon===id?'装备中':unlocked?'已拾取':'未拾取';
      this.label(card,`${def.name} · ${status}`,-195,y,14,color,136,30);
      if(id==='shotgun'){
        const text=`基础 ${def.minDamage}–${def.damage}\n当前 ${(def.minDamage!*multiplier).toFixed(1)}–${(def.damage*multiplier).toFixed(1)}`;
        const damageLabel=this.label(card,text,-65,y,12,color,130,32);damageLabel.lineHeight=14;
      }else this.label(card,`${def.damage} / ${(def.damage*multiplier).toFixed(1)}`,-65,y,16,color,130,30);
      this.label(card,(1/def.interval).toFixed(2),75,y,16,color,124,30);
      this.label(card,`${def.range}`,210,y,16,color,90,30);
    });
    this.label(card,'霰弹枪：扩散到达时扣血；首次命中距离决定本次扇形统一伤害。',0,-107,12,new Color(255,218,155),560,20);
    this.label(card,`经验加成 +${this.xpCount*5}% · 进阶加成 +${this.evolution*12}% · 距离单位：游戏单位`,0,-130,12,new Color(187,206,218),560,20);
    this.button(card,'返回战斗',0,-165,180,38,()=>this.closeModal(),new Color(35,145,116));
  }
  private drawJoystick() {
    const n = this.makeNode('Joystick', this.ui, -this.screenW*.08, -this.screenH*.12, 120, 120);
    this.addGraphics(n, g=>{g.fillColor=new Color(255,255,255,34);g.circle(0,0,52);g.fill();g.strokeColor=new Color(255,255,255,100);g.lineWidth=3;g.circle(0,0,52);g.stroke();});
    this.joystickKnob=this.makeNode('JoystickKnob',n,0,0,48,48);
    this.addGraphics(this.joystickKnob,g=>{g.fillColor=new Color(212,239,219,145);g.circle(0,0,21);g.fill();g.strokeColor=new Color(255,255,255,125);g.lineWidth=2;g.circle(0,0,21);g.stroke();});
  }
  private placeChests() {
    this.chestSprites = []; this.chestFallbacks = [];
    const positions:Vec2[]=[];
    while(positions.length<2){
      let candidate:Vec2|null=null;
      for(let attempt=0;attempt<500;attempt++){
        const x=(Math.random()-.5)*(this.worldW-240),y=(Math.random()-.5)*(this.worldH-240),p=new Vec2(x,y);
        const farFromStart=Math.hypot(x,y)>Math.min(this.screenW*.48,520);
        const farFromOther=positions.every(q=>Vec2.distance(p,q)>Math.min(this.screenW*.72,760));
        if(farFromStart&&farFromOther&&this.isLandPosition(x,y)){candidate=p;break;}
      }
      if(!candidate){
        // Deterministic scan guarantees a land-only fallback if random attempts fail.
        for(let v=.06;v<=.94&&!candidate;v+=.04)for(let u=.06;u<=.94&&!candidate;u+=.04){
          const x=(u-.5)*this.worldW,y=(.5-v)*this.worldH;
          if(this.isLandPosition(x,y)&&Math.hypot(x,y)>Math.min(this.screenW*.3,320)&&positions.every(q=>Vec2.distance(q,new Vec2(x,y))>Math.min(this.screenW*.45,480)))candidate=new Vec2(x,y);
        }
      }
      if(!candidate)break;
      positions.push(candidate);
    }
    positions.forEach((p,i)=>{
      const n=this.makeNode(`Chest${i+1}`,this.world,p.x,p.y,74,70); this.chestNodes.push(n);
      const fallback=this.makeNode('ChestFallback',n,0,0,56,42);this.chestFallbacks.push(fallback);this.addGraphics(fallback,g=>{g.fillColor=new Color(158,83,42);g.roundRect(-25,-17,50,34,6);g.fill();g.fillColor=new Color(240,190,75);g.rect(-25,-3,50,8);g.fill();g.fillColor=new Color(250,218,128);g.rect(-5,-9,10,19);g.fill();g.strokeColor=new Color(255,222,140);g.lineWidth=3;g.roundRect(-25,-17,50,34,6);g.stroke();});
      const art=this.makeNode('ChestArt',n,0,0,64,64);const sprite=art.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;this.chestSprites.push(sprite);if(this.chestFrames.length)sprite.spriteFrame=this.chestFrames[0];else fallback.active=true;
      this.label(n,`宝箱${i+1}`,0,42,14,new Color(255,243,198),100,26);
    });
    this.applyChestFrames();
  }
  private updateChestGuide(dt=0){
    if(this.state==='playing'&&!this.paused&&this.chestIndex===1)this.secondChestGuideElapsed+=dt;
    const index=this.chestIndex===0?0:this.chestIndex===1&&this.secondChestGuideElapsed>=20?1:-1;
    const marker=this.chestGuideMarker;const label=this.chestGuideLabel;const chest=this.chestNodes[index];
    if(!marker?.isValid||!label?.isValid)return;
    if(this.state!=='playing'||index<0||!chest?.isValid){marker.active=false;label.string='';return;}
    marker.active=true;
    const playerX=this.player.position.x+this.world.position.x;const playerY=this.player.position.y+this.world.position.y;
    const targetX=chest.position.x+this.world.position.x;const targetY=chest.position.y+this.world.position.y;
    const dx=targetX-playerX;const dy=targetY-playerY;const distance=Math.hypot(dx,dy)||1;
    const maxX=this.screenW/2-48;const maxY=this.screenH/2-142;
    const tx=dx>0?(maxX-playerX)/dx:dx<0?(-maxX-playerX)/dx:Infinity;
    const ty=dy>0?(maxY-playerY)/dy:dy<0?(-maxY-playerY)/dy:Infinity;
    const scale=Math.max(0,Math.min(1,tx>0?tx:1,ty>0?ty:1));
    const x=playerX+dx*scale;const y=playerY+dy*scale;
    marker.setPosition(x,y+24,0);marker.setRotationFromEuler(0,0,Math.atan2(dy,dx)*180/Math.PI);
    const labelHalfWidth=label.node.getComponent(UITransform)!.contentSize.width/2;
    const labelX=Math.max(-this.screenW/2+labelHalfWidth+12,Math.min(this.screenW/2-labelHalfWidth-12,x));
    label.node.setPosition(labelX,y-17,0);
    const name=index===0?'第一只':'第二只';
    label.string=distance<125?`${name}宝箱就在这里`:`寻找${name}宝箱 · 金币 ${this.gold}/${this.chestGold[index]}`;
  }
  private placePickups() {
    for(let i=0;i<3;i++){const p=this.randomDropPosition();this.spawnPickup('xp',p.x,p.y,1);}
    for(let i=0;i<1;i++){const p=this.randomDropPosition();this.spawnPickup('heart',p.x,p.y,30);}
    const weapons: WeaponId[]=['handgun','rifle','shotgun']; weapons.forEach(w=>{const p=this.randomDropPosition();this.spawnPickup(w,p.x,p.y,0);});
  }
  private isLandPosition(x:number,y:number){
    const u=(x+this.worldW/2)/this.worldW;const v=.5-y/this.worldH;
    if(u<.01||u>.99||v<.02||v>.98)return false;
    return !this.waterPolygons.some(poly=>this.pointInPolygon(u,v,poly));
  }
  private pointInPolygon(x:number,y:number,poly:number[][]){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,yi]=poly[i],[xj,yj]=poly[j];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))inside=!inside;}return inside;}
  private randomDropPosition(){const origin=this.player.position;let x=0,y=0,tries=0,valid=false;while(!valid&&tries<40){x=origin.x+(Math.random()-.5)*this.screenW*.78;y=origin.y+(Math.random()-.5)*this.screenH*.66;valid=Math.hypot(origin.x-x,origin.y-y)>105&&!this.chestNodes.some(c=>Math.hypot(c.position.x-x,c.position.y-y)<85)&&!this.pickups.some(p=>Math.hypot(p.node.position.x-x,p.node.position.y-y)<58);tries++;}return new Vec2(x,y);}
  private spawnPickup(kind: PickupKind, x:number,y:number, amount:number) {
    const n=this.makeNode(`Drop_${kind}`,this.world,x,y,50,50);const sprite=n.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;
    // Keep drops invisible until their real sprite frames load; do not flash placeholder circles or glyphs.
    const fallback=this.makeNode('Fallback',n,0,0,50,50);fallback.active=false;
    const pickup:Pickup={node:n,sprite,fallback,kind,amount,taken:false,baseY:y,bobPhase:Math.random()*Math.PI*2};this.pickups.push(pickup);this.applyPickupArt(pickup);
  }
  private movePlayer(dt:number) {
    const p=this.player.position; let x=p.x+this.move.x*270*dt, y=p.y+this.move.y*270*dt;
    if(Math.abs(this.move.x)>.08)this.petFacingLeft=this.move.x<0;
    x=Math.max(-this.worldW*.5+55,Math.min(this.worldW*.5-55,x)); y=Math.max(-this.worldH*.5+55,Math.min(this.worldH*.5-55,y)); this.player.setPosition(x,y,0);
    if (this.move.length() > 0.08) this.facePlayer(this.move.x, this.move.y);
    if (!this.playerActionRemaining) this.setPlayerLocomotion(this.move.length() > .08);
  }
  private moveEnemies(dt:number) {
    const living=this.enemies.filter(e=>e.alive);
    if(this.spawnTimer<=0 && living.length < this.maxEnemies-(this.bossSpawned?8:0)) { this.spawnEnemy(false); const waveMult=[1,1.5,2][Math.min(this.wave,2)]; this.spawnTimer=Math.max(.35,1.25/(waveMult*(this.difficulty==='hard'?1.35:1))); }
    for(const e of living){
      const d=this.distance(e.node,this.player);e.attackCd-=dt;
      if(e.kind==='plant'){
        // Biting plants stay rooted and can only hurt the player at close range.
        if(d<e.radius+48&&e.attackCd<=0){e.attackCd=1.45;this.playEnemyAttack(e);this.damagePlayer(e.damage);if(this.state!=='playing')return;}
        continue;
      }
      if(e.kind==='bat'){
        // Bats hover at a distance and periodically shoot a projectile.
        const toward=this.direction(e.node,this.player);
        if(d>255)e.node.setPosition(e.node.position.x+toward.x*e.speed*dt,e.node.position.y+toward.y*e.speed*dt,0);
        else if(d<185)e.node.setPosition(e.node.position.x-toward.x*e.speed*dt,e.node.position.y-toward.y*e.speed*dt,0);
        if(d<480&&e.attackCd<=0){e.attackCd=2.15;this.playEnemyAttack(e);this.spawnEnemyProjectile(e);}
        continue;
      }
      if(e.boss){
        // Keep the boss pursuing the player between and during ranged attacks.
        // The previous branch only updated its facing and fired projectiles,
        // then continued, so it never reached the shared enemy movement code.
        if(d>e.radius*.55){const v=this.direction(e.node,this.player);e.node.setPosition(e.node.position.x+v.x*e.speed*dt,e.node.position.y+v.y*e.speed*dt,0);}
        if(e.attackRemaining<=0)this.updateBossDirection(e);
        e.specialCd=(e.specialCd??1.25)-dt;
        if(e.specialCd<=0){e.specialCd=2.35;this.playEnemyAttack(e);this.spawnBossMagicBurst(e);}
        if(d<e.radius+25&&e.attackCd<=0){e.attackCd=1.35;this.damagePlayer(e.damage);if(this.state!=='playing')return;}
        continue;
      }
      if(d>e.radius*.55){const v=this.direction(e.node,this.player);e.node.setPosition(e.node.position.x+v.x*e.speed*dt,e.node.position.y+v.y*e.speed*dt,0);}
      if(d<e.radius+25&&e.attackCd<=0){e.attackCd=e.boss?1.35:1.1;this.playEnemyAttack(e);this.damagePlayer(e.damage);if(this.state!=='playing')return;}
    }
    if(this.bossCountdown>=0 && !this.bossSpawned){this.hud.boss.string=`Boss ${Math.ceil(this.bossCountdown)} 秒后到达`;}
  }
  private spawnEnemy(boss:boolean) {
    if(!this.initialResourcesReady||(boss&&!this.bossResourcesReady))return;
    let kind:EnemyKind='boss';if(!boss){const roll=Math.random();kind=roll<.12?'plant':roll<.32?'bat':roll<.66?'mushroom':'eye';}
    const p=this.player?.position||new Vec3();let x=0,y=0;let placed=false;
    for(let attempt=0;attempt<120;attempt++){const angle=Math.random()*Math.PI*2,radius=Math.max(this.screenW,this.screenH)*.68;x=Math.max(-this.worldW*.5+80,Math.min(this.worldW*.5-80,p.x+Math.cos(angle)*radius));y=Math.max(-this.worldH*.5+80,Math.min(this.worldH*.5-80,p.y+Math.sin(angle)*radius));if(kind!=='plant'||this.isLandPosition(x,y)){placed=true;break;}}
    if(!placed)return;
    const d=DIFF[this.difficulty]; const scale=[1,1.35,1.8][Math.min(this.wave,2)];
    const packEnemy=kind==='bat'||kind==='plant';const size=boss?150:packEnemy?58:46;
    const n=this.makeNode(boss?'Boss':kind==='bat'?'HornedBat':kind==='plant'?'BitingPlant':'Enemy',this.world,x,y,size,boss?160:size);n.setScale(boss?1.16:packEnemy?1.2:1.38,boss?1.16:packEnemy?1.2:1.38,1); const spr=n.addComponent(Sprite); spr.sizeMode=Sprite.SizeMode.CUSTOM;
    const fallback=this.makeNode('Fallback',n,0,0,boss?150:size,boss?160:size); this.addGraphics(fallback,g=>{g.fillColor=boss?new Color(127,49,100):kind==='plant'?new Color(188,80,105):kind==='bat'?new Color(95,75,140):new Color(102,145,73);g.circle(0,0,boss?54:size*.34);g.fill();g.fillColor=new Color(240,219,171);g.circle(-6,5,3);g.circle(6,5,3);g.fill();});
    const base=boss?520:kind==='plant'?12:kind==='bat'?12:9; const hp=base*(boss?d.bossHp:d.hp)*scale; const e:Enemy={node:n,sprite:spr,fallback,hp,maxHp:hp,speed:kind==='plant'?0:(boss?d.bossSpeed:(kind==='bat'?72:65)*d.speed),damage:(boss?18:kind==='plant'?11:kind==='bat'?6:7)*(boss?d.bossDamage:d.damage),attackCd:kind==='plant'?1.1:kind==='bat'?1.4:1,specialCd:boss?1.25:undefined,radius:boss?76:kind==='plant'?34:kind==='bat'?32:38,boss,kind,indestructible:kind==='plant',attackRemaining:0,alive:true}; this.enemies.push(e);
    if(boss){this.loadBossFrames(e);} else if(packEnemy){this.loadEnemyPackFrames(e,kind==='bat'?'bat':'plant');} else if(kind==='mushroom'||kind==='eye'){this.loadEnemyFrames(e,kind);}
    if(boss) this.showMessage('Boss 登场！');
  }
  private playEnemyAttack(e:Enemy){if(!e.attackFrames?.length||!e.anim)return;const frames=e.boss?e.attackFrames.slice((e.bossDirectionRow??0)*6,(e.bossDirectionRow??0)*6+6):e.attackFrames;e.anim.frames=frames;e.anim.clock=0;e.anim.index=0;e.sprite.spriteFrame=frames[0];e.attackRemaining=frames.length/12;}
  private damagePlayer(amount:number){this.hp-=amount;this.playerHit();if(this.hp<=0)this.finish(false);}
  private spawnEnemyProjectile(e:Enemy){
    const direction=this.direction(e.node,this.player);
    // Spawn the shot just in front of the bat so the later-rendered projectile
    // does not cover its body during the attack animation.
    const spawnX=e.node.position.x+direction.x*34,spawnY=e.node.position.y+direction.y*34;
    const node=this.makeNode('BatProjectile',this.world,spawnX,spawnY,22,22);
    this.addGraphics(node,g=>{g.fillColor=new Color(105,62,166,235);g.circle(0,0,9);g.fill();g.fillColor=new Color(231,164,255,235);g.circle(-2,2,3);g.fill();g.strokeColor=new Color(248,204,255,230);g.lineWidth=2;g.circle(0,0,9);g.stroke();});
    this.enemyProjectiles.push({node,direction,speed:250,remaining:2.4,damage:e.damage});
  }
  private spawnBossMagicBurst(e:Enemy){
    // A full ring of 30 blue magic shots. The slower projectiles leave gaps
    // for the player to dodge while still making the attack visibly dense.
    const count=30;const origin=e.node.position;
    for(let i=0;i<count;i++){
      const angle=(Math.PI*2*i)/count;const direction=new Vec2(Math.cos(angle),Math.sin(angle));
      const x=origin.x+direction.x*58,y=origin.y+direction.y*58;
      const node=this.makeNode('BossMagicOrb',this.world,x,y,26,26);
      this.addGraphics(node,g=>{g.fillColor=new Color(36,126,255,72);g.circle(0,0,12);g.fill();g.fillColor=new Color(82,177,255,245);g.circle(0,0,8);g.fill();g.fillColor=new Color(211,242,255,255);g.circle(-2,3,3);g.fill();g.strokeColor=new Color(153,220,255,245);g.lineWidth=2;g.circle(0,0,9);g.stroke();});
      this.enemyProjectiles.push({node,direction,speed:DIFF[this.difficulty].bossProjectileSpeed,remaining:3.3,damage:e.damage*.42,hitRadius:22,magic:true});
    }
  }
  private moveEnemyProjectiles(dt:number){
    for(const p of this.enemyProjectiles){if(!p.node.isValid)continue;p.remaining-=dt;p.node.setPosition(p.node.position.x+p.direction.x*p.speed*dt,p.node.position.y+p.direction.y*p.speed*dt,0);if(this.distance(p.node,this.player)<(p.hitRadius??30)){p.node.destroy();this.damagePlayer(p.damage);if(this.state!=='playing')return;}else if(p.remaining<=0)p.node.destroy();}
    this.enemyProjectiles=this.enemyProjectiles.filter(p=>p.node.isValid);
  }
  private autoAttack() {
    const def=W[this.weapon]; if(this.attackTimer>0)return; const target=this.findTarget(def.range); if(!target)return;
    this.facePlayer(target.node.position.x-this.player.position.x,target.node.position.y-this.player.position.y);
    this.attackTimer=def.interval;
    this.playPlayerAction(def.melee ? 'meleeattack' : 'shoot', def.melee ? .45 : .18);
    if(this.weapon==='shotgun'){
      // The second shoot frame is the release frame. Wait for it, then use
      // the live player/target positions instead of the initial aiming frame.
      const frames=this.survivorFrames.get('shotgun/shoot');
      this.pendingShotgunDelay=.18/Math.max(1,frames?.length||3);return;
    }
    this.playWeaponSfx(this.weapon);
    const damage=def.damage*this.weaponDamageMultiplier();
    if(!def.melee){this.showMuzzleFlash(target.node.position);this.projectile(target,def.color,damage);return;}
    this.damageEnemy(target,damage,new Color(255,246,169));
  }
  private updatePendingShotgun(dt:number){
    if(this.pendingShotgunDelay===null)return;
    if(this.weapon!=='shotgun'){this.pendingShotgunDelay=null;return;}
    this.pendingShotgunDelay-=dt;
    if(this.pendingShotgunDelay>1e-9)return;
    this.pendingShotgunDelay=null;
    const target=this.findTarget(W.shotgun.range);if(!target)return;
    this.facePlayer(target.node.position.x-this.player.position.x,target.node.position.y-this.player.position.y);
    this.playWeaponSfx('shotgun');this.showMuzzleFlash(target.node.position);this.fireShotgun(target);
  }
  private shotgunBaseDamage(distance:number){
    const def=W.shotgun;
    const fraction=Math.max(0,Math.min(1,distance/def.range));
    return def.damage+((def.minDamage??1)-def.damage)*fraction;
  }
  private fireShotgun(target:Enemy){
    const origin=new Vec2(this.player.position.x,this.player.position.y);
    const dx=target.node.position.x-origin.x,dy=target.node.position.y-origin.y;
    const aim=dx===0&&dy===0?this.facingAngle*Math.PI/180:Math.atan2(dy,dx);
    const def=W.shotgun,count=def.pelletCount??5,spread=(def.spreadDegrees??48)*Math.PI/180;
    const multiplier=this.weaponDamageMultiplier();
    for(let i=0;i<count;i++){
      const angle=aim+(count===1?0:(i/(count-1)-.5)*spread);
      this.createShotgunPellet(origin,new Vec2(Math.cos(angle),Math.sin(angle)));
    }
    const forward=new Vec2(Math.cos(aim),Math.sin(aim));
    const edge=Math.cos(spread/2);
    // The blast and five visible pellets travel at the same speed. Decide
    // damage at first contact, then reuse it for all enemies hit by this shot.
    this.shotgunBlasts.push({origin,forward,edge,travelled:0,range:def.range,speed:600,multiplier,damage:null,hit:new Set<Enemy>()});
  }
  private createShotgunPellet(origin:Vec2,direction:Vec2){
    const node=this.makeNode('ShotgunPellet',this.world,origin.x,origin.y,20,9);
    node.setRotationFromEuler(0,0,Math.atan2(direction.y,direction.x)*180/Math.PI);
    if(this.gunTracerFrames.length){
      const sprite=node.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=this.gunTracerFrames[0];
      this.animations.push({node,sprite,frames:this.gunTracerFrames,fps:20,clock:0});
    }else this.addGraphics(node,g=>{g.fillColor=W.shotgun.color;g.roundRect(-7,-2,14,4,2);g.fill();});
    this.shotgunPellets.push({node,direction,travelled:0,range:W.shotgun.range,speed:600});
  }
  private moveShotgunPellets(dt:number){
    // Advance visuals before applying the matching expanding cone's damage.
    for(const pellet of this.shotgunPellets){
      if(!pellet.node.isValid)continue;
      const step=Math.min(pellet.speed*dt,Math.max(0,pellet.range-pellet.travelled));
      const pos=pellet.node.position;
      pellet.node.setPosition(pos.x+pellet.direction.x*step,pos.y+pellet.direction.y*step,0);
      pellet.travelled+=step;
      if(pellet.travelled>=pellet.range)pellet.node.destroy();
    }
    this.shotgunPellets=this.shotgunPellets.filter(p=>p.node.isValid);
    this.updateShotgunBlasts(dt);
  }
  private updateShotgunBlasts(dt:number){
    for(const blast of this.shotgunBlasts){
      blast.travelled=Math.min(blast.range,blast.travelled+blast.speed*dt);
      const contacts:{enemy:Enemy;distance:number}[]=[];
      for(const enemy of this.enemies){
        if(!enemy.alive||enemy.indestructible||!enemy.node.isValid||blast.hit.has(enemy))continue;
        const dx=enemy.node.position.x-blast.origin.x,dy=enemy.node.position.y-blast.origin.y;
        const distance=Math.hypot(dx,dy);
        if(distance>blast.travelled+1e-9)continue;
        if(distance>0&&(dx*blast.forward.x+dy*blast.forward.y)/distance<blast.edge-1e-9)continue;
        contacts.push({enemy,distance});
      }
      contacts.sort((a,b)=>a.distance-b.distance);
      for(const contact of contacts){
        if(blast.damage===null)blast.damage=this.shotgunBaseDamage(contact.distance)*blast.multiplier;
        blast.hit.add(contact.enemy);
        this.showGunImpact(contact.enemy.node.position.clone());
        this.damageEnemy(contact.enemy,blast.damage,W.shotgun.color);
        if(this.state!=='playing')return;
      }
    }
    this.shotgunBlasts=this.shotgunBlasts.filter(b=>b.travelled<b.range);
  }
  private updatePets(dt:number) {
    const playerScreenX=this.player.position.x+this.world.position.x;
    const playerScreenY=this.player.position.y+this.world.position.y;
    const edgeX=Math.min(150,this.screenW*.18),edgeY=Math.min(150,this.screenH*.20),hysteresis=32;
    const edgeAxis=(current:-1|0|1,pos:number,half:number,margin:number):-1|0|1=>{
      if(current===-1&&pos< -half+margin+hysteresis)return -1;
      if(current===1&&pos> half-margin-hysteresis)return 1;
      if(pos< -half+margin)return -1;
      if(pos> half-margin)return 1;
      return 0;
    };
    this.petEdgeX=edgeAxis(this.petEdgeX,playerScreenX,this.screenW/2,edgeX);
    this.petEdgeY=edgeAxis(this.petEdgeY,playerScreenY,this.screenH/2,edgeY);
    // Each edge/corner moves the pair inward; companions use staggered slots so they do not overlap.
    let slots:[number,number,number,number]=[-56,-54,56,-54];
    if(this.petEdgeX===-1&&this.petEdgeY===1)slots=[58,-68,112,-8];             // top-left -> bottom-right
    else if(this.petEdgeX===1&&this.petEdgeY===1)slots=[-58,-68,-112,-8];       // top-right -> bottom-left
    else if(this.petEdgeX===-1&&this.petEdgeY===-1)slots=[58,68,112,8];         // bottom-left -> top-right
    else if(this.petEdgeX===1&&this.petEdgeY===-1)slots=[-58,68,-112,8];        // bottom-right -> top-left
    else if(this.petEdgeX===-1)slots=[76,-34,76,34];                            // left -> right
    else if(this.petEdgeX===1)slots=[-76,-34,-76,34];                           // right -> left
    else if(this.petEdgeY===1)slots=[-56,-90,56,-90];                           // top -> bottom
    else if(this.petEdgeY===-1)slots=[-56,74,56,74];                             // bottom -> top
    const safeLeft=-this.screenW/2+54,safeRight=this.screenW/2-54;
    const safeBottom=-this.screenH/2+90,safeTop=this.screenH/2-96;
    this.pets.forEach((pet,i)=>{
      const sx=playerScreenX+slots[i*2],sy=playerScreenY+slots[i*2+1];
      const tx=Math.max(safeLeft,Math.min(safeRight,sx))-this.world.position.x;
      const ty=Math.max(safeBottom,Math.min(safeTop,sy))-this.world.position.y;
      const p=pet.node.position;
      pet.node.setPosition(p.x+(tx-p.x)*Math.min(1,dt*8),p.y+(ty-p.y)*Math.min(1,dt*8),0);
      // Pet sprites only mirror horizontally, so they never become upside down.
      pet.node.setRotationFromEuler(0,0,0);pet.node.setScale(this.petFacingLeft?-1.7:1.7,1.7,1);
      if(pet.anim?.frames.length){pet.anim.clock+=dt;if(pet.anim.clock>=1/pet.anim.fps){pet.anim.clock=0;pet.anim.index=((pet.anim.index??0)+1)%pet.anim.frames.length;pet.sprite.spriteFrame=pet.anim.frames[pet.anim.index];}}
      pet.attackCd-=dt;if(pet.attackCd<=0){const e=this.findTarget(310);if(e){pet.attackCd=1.3;this.petAreaAttack(pet,e);}}
    });
  }
  private petAreaAttack(pet:Pet, target:Enemy) {
    const tier2=pet.id==='dragonling'||pet.id==='squirrel';
    const radius=tier2?148:84;
    const damage=9*(1+this.evolution*.35)*(1+this.xpCount*.05);
    const center=target.node.position.clone();
    const petSound:Record<PetId,string>={fox:'petFox',frog:'petFrog',dragonling:'petDragonling',squirrel:'petSquirrel'};
    this.playSfx(petSound[pet.id],.48);
    // One cast hits every enemy in the visible impact area.
    for(const enemy of [...this.enemies]) {
      if(enemy.alive && !enemy.indestructible && Math.hypot(enemy.node.position.x-center.x,enemy.node.position.y-center.y)<=radius) {
        this.damageEnemy(enemy,damage,new Color(158,226,255));
        if(this.state!=='playing') return;
      }
    }
    this.showPetAreaEffect(pet.id,center,radius,tier2);
  }
  private showPetAreaEffect(id:PetId,center:Vec3,radius:number,tier2:boolean) {
    const colors:Record<PetId,Color>={fox:new Color(255,139,70,215),frog:new Color(96,217,239,215),dragonling:new Color(255,88,48,225),squirrel:new Color(191,144,255,220)};
    const area=this.makeNode(`PetAoE_${id}`,this.world,center.x,center.y,radius*2,radius*2);
    const frames=this.petEffectFrames.get(id);
    if(frames?.length){
      const visual=this.makeNode('AnimatedSkill',area,0,0,tier2?112:76,tier2?112:76);const sprite=visual.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=frames[0];
      const anim:Anim={node:visual,sprite,frames,fps:12,clock:0};this.animations.push(anim);
    } else {
      const pulse=this.makeNode('FallbackPulse',area,0,0,radius*1.35,radius*1.35);this.addGraphics(pulse,g=>{g.fillColor=new Color(colors[id].r,colors[id].g,colors[id].b,70);g.circle(0,0,radius*.65);g.fill();});
    }
    this.scheduleOnce(()=>{if(area.isValid)area.destroy();this.animations=this.animations.filter(a=>a.node.isValid);},Math.max(.55,(frames?.length||7)/12));
  }
  private updatePickups(dt:number) {
    for(const p of this.pickups){if(p.taken)continue;
      if(p.anim?.frames.length){p.anim.clock+=dt;while(p.anim.clock>=1/p.anim.fps){p.anim.clock-=1/p.anim.fps;p.anim.index=((p.anim.index??0)+1)%p.anim.frames.length;p.sprite.spriteFrame=p.anim.frames[p.anim.index];}}
      // Uncollected weapons hover slightly higher and more slowly than loot.
      // Use the fixed spawn height so the bob never drifts over time.
      const isWeapon=p.kind!=='coin'&&p.kind!=='xp'&&p.kind!=='heart';
      p.bobPhase+=dt*(isWeapon?2.6:3.2);
      p.node.setPosition(p.node.position.x,p.baseY+Math.sin(p.bobPhase)*(isWeapon?7:5),0);
      if(p.kind==='heart'&&this.hp>=this.maxHp)continue;if(this.distance(p.node,this.player)<42){p.taken=true;p.node.destroy();this.playSfx('pickup', 0.55);if(p.kind==='coin'){const gained=Math.min(p.amount,MAX_GOLD-this.gold);this.gold+=gained;this.showMessage(gained?`金币 +${gained}`:'金币已达上限');}else if(p.kind==='xp'){if(this.playerLevel<MAX_LEVEL){this.xpCount++;this.showMessage(`升至 ${this.playerLevel} 级 · 全部攻击 +${this.xpCount*5}%`);}else this.showMessage('已达到最高等级 10');}else if(p.kind==='heart'){const healed=Math.min(p.amount,this.maxHp-this.hp);this.hp+=healed;this.showMessage(`生命恢复 +${Math.ceil(healed)}`);}else{if(this.owned.indexOf(p.kind)<0){this.owned.push(p.kind);this.showMessage(`获得${W[p.kind].name}，点击底部快捷栏即可切换`);}else{const gained=Math.min(10,MAX_GOLD-this.gold);this.gold+=gained;this.showMessage(`重复武器转化为金币 +${gained}`);}}this.refreshHud();}}
  }
  private updateChests(dt:number) {
    if(this.chestIndex>=2)return;const chest=this.chestNodes[this.chestIndex];if(!chest||!chest.isValid)return;const d=this.distance(chest,this.player);if(d<105){if(this.gold>=this.chestGold[this.chestIndex]){this.gold-=this.chestGold[this.chestIndex];this.openChest();}else if(Math.random()<dt*.7)this.showMessage(`靠近宝箱并收集金币 ${this.gold}/${this.chestGold[this.chestIndex]}`);}
  }
  private openChest() {
    const tier=this.chestIndex;this.paused=true;this.playSfx('openChest', 0.6);this.evolution=Math.min(2,this.evolution+1);this.maxHp+=22;this.hp=Math.min(this.maxHp,this.hp+38);this.wave=tier+1;this.player.setScale(1+this.evolution*.08,1+this.evolution*.08,1);if(!this.evolutionLabel?.node.isValid)this.evolutionLabel=this.label(this.player,'',0,38,18,new Color(255,224,116),60,28);this.evolutionLabel.string=this.evolution===1?'✦':'✦✦';
    this.playChestOpen(tier);
    const version=this.sceneVersion;
    this.scheduleOnce(()=>{if(this.isValid&&version===this.sceneVersion&&this.state==='playing')void this.showChestReward(tier);},this.chestFrames.length?0.58:0);
  }
  private async showChestReward(tier:number){
    if(this.state!=='playing'||tier!==this.chestIndex)return;
    const version=this.sceneVersion;
    if(!this.petResourcesReady||(tier===1&&!this.bossResourcesReady)){
      this.showStageLoading(tier===1?'正在准备宠物和 Boss 资源':'正在准备宠物资源');
      try{
        await Promise.all([this.preparePetResources(),...(tier===1?[this.prepareBossResources()]:[])]);
      }catch(error){
        if(this.isValid&&version===this.sceneVersion&&this.state==='playing')this.showStageLoadError(error,()=>{void this.showChestReward(tier);});
        return;
      }
      if(!this.isValid||version!==this.sceneVersion||this.state!=='playing'||tier!==this.chestIndex)return;
      this.removeStageModal();
    }
    const options:PetId[]=tier===0?['fox','frog']:['dragonling','squirrel'];
    const modal=this.makeModal(tier===0?'一阶宝箱 · 角色进阶！':'二阶宝箱 · 角色再次进阶！','选择一只宠物加入战斗');
    options.forEach((id,i)=>{const tier2=id==='dragonling'||id==='squirrel';this.button(modal,`${this.petName(id)} · ${this.petSkillName(id)}\n范围伤害 · 半径 ${tier2?148:84}`,(i===0?-1:1)*170,-20,230,110,()=>{this.playSfx('petGet',.65);this.addPet(id);this.chestIndex++;if(this.chestIndex===1)this.secondChestGuideElapsed=0;this.chestNodes[this.chestIndex-1].destroy();this.closeModal();if(this.chestIndex===2){this.bossCountdown=10;this.bossAudioActive=true;this.startBossAudio();this.showMessage('怪潮增强，Boss 即将到达！');}else this.showMessage('第一波怪潮增强！');this.refreshHud();},i===0?new Color(73,118,102):new Color(94,83,139));});
    this.label(modal,`固定进阶：形态 ${this.evolution+1} · 生命上限 +22`,0,-135,17,new Color(250,218,146),480,32);
  }
  private applyChestFrames(){if(!this.chestFrames.length)return;this.chestSprites.forEach((sprite,i)=>{if(!sprite.node.isValid)return;sprite.spriteFrame=this.chestFrames[0];if(this.chestFallbacks[i]?.isValid)this.chestFallbacks[i].active=false;});}
  private playChestOpen(index:number){const sprite=this.chestSprites[index];if(!sprite?.node.isValid||!this.chestFrames.length)return;this.chestFrames.forEach((frame,i)=>this.scheduleOnce(()=>{if(sprite.node.isValid)sprite.spriteFrame=frame;},i*.065));}
  private updateBossCountdown(dt:number){if(this.bossCountdown<0||this.bossSpawned)return;this.bossCountdown-=dt;if(this.bossCountdown<=0){this.bossCountdown=-1;void this.enterBossBattle();}}
  private async enterBossBattle(){
    if(this.state!=='playing'||this.bossSpawned)return;
    const version=this.sceneVersion;
    if(!this.bossResourcesReady){
      this.showStageLoading('正在准备 Boss 资源');
      try{await this.prepareBossResources();}
      catch(error){if(this.isValid&&version===this.sceneVersion&&this.state==='playing')this.showStageLoadError(error,()=>{void this.enterBossBattle();});return;}
      if(!this.isValid||version!==this.sceneVersion||this.state!=='playing')return;
      this.removeStageModal();
    }
    this.paused=false;this.bossSpawned=true;this.bgmSuppressedForBoss=true;this.stopBgm();
    this.spawnEnemy(true);this.hud.boss.string='BOSS';this.startBossAudio();
  }
  private damageEnemy(e:Enemy,amount:number,color:Color){if(!e.alive||e.indestructible)return;e.hp-=amount;this.hitFlash(e.node,color);if(e.hp<=0){e.alive=false;const x=e.node.position.x,y=e.node.position.y;e.node.destroy();if(!e.boss&&this.gold<MAX_GOLD)this.spawnPickup('coin',x,y,this.chestIndex>0?3:2);if(e.boss){this.finish(true);return;}if(this.playerLevel<MAX_LEVEL&&Math.random()<.12)this.spawnPickup('xp',x+12,y+8,1);if(Math.random()<.07)this.spawnPickup('heart',x-12,y-8,30);}}
  private projectile(e:Enemy,color:Color,damage:number,from?:Vec3){
    const origin=from||this.player.position;const end=e.node.position.clone();
    const n=this.makeNode('Projectile',this.world,origin.x,origin.y,48,32);const sprite=n.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;
    if(this.gunTracerFrames.length){sprite.spriteFrame=this.gunTracerFrames[0];this.animations.push({node:n,sprite,frames:this.gunTracerFrames,fps:20,clock:0});}
    else {const fallback=this.makeNode('Fallback',n,0,0,12,12);this.addGraphics(fallback,g=>{g.fillColor=color;g.circle(0,0,5);g.fill();});}
    const dx=end.x-origin.x,dy=end.y-origin.y;n.setRotationFromEuler(0,0,Math.atan2(dy,dx)*180/Math.PI);
    tween(n).to(.16,{position:new Vec3(end.x,end.y,0)}).call(()=>{
      if(n.isValid)n.destroy();
      if(e.alive&&e.node.isValid){this.damageEnemy(e,damage,color);this.showGunImpact(e.node.position.clone());}
    }).start();
  }
  private showMuzzleFlash(target:Vec3){if(!this.muzzleFrames.length)return;const dx=target.x-this.player.position.x,dy=target.y-this.player.position.y,len=Math.max(1,Math.hypot(dx,dy));const x=this.player.position.x+dx/len*32,y=this.player.position.y+dy/len*32;this.showGunAnimation('MuzzleFlash',this.muzzleFrames,new Vec3(x,y,0),42,42,20,Math.atan2(dy,dx)*180/Math.PI);}
  private showGunImpact(pos:Vec3){if(this.gunImpactFrames.length)this.showGunAnimation('BulletImpact',this.gunImpactFrames,pos,58,58,15,0);}
  private showGunAnimation(name:string,frames:SpriteFrame[],pos:Vec3,w:number,h:number,fps:number,rotation:number){
    const node=this.makeNode(name,this.world,pos.x,pos.y,w,h);node.setRotationFromEuler(0,0,rotation);const sprite=node.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=frames[0];
    this.animations.push({node,sprite,frames,fps,clock:0});this.scheduleOnce(()=>{if(node.isValid)node.destroy();},frames.length/fps);
  }
  private hitFlash(n:Node,color:Color){if(this.hitFlashing.has(n))return;this.hitFlashing.add(n);const old=n.scale.clone();n.setScale(old.x*1.12,old.y*1.12,1);this.scheduleOnce(()=>{if(n.isValid)n.setScale(old);this.hitFlashing.delete(n);},.12);}
  private playerHit(){this.player.setScale(.86,.86,1);this.playSfx('hit',0.2);this.scheduleOnce(()=>{if(this.player?.isValid){const s=1+this.evolution*.08;this.player.setScale(s,s,1);}},.12);}
  private findTarget(range:number):Enemy|null{let best:Enemy|null=null,bestD=range;for(const e of this.enemies){if(!e.alive||e.indestructible)continue;const d=this.distance(e.node,this.player);if(d<=bestD){best=e;bestD=d;}}return best;}
  private distance(a:Node,b:Node){return Vec3.distance(a.position,b.position);}
  private direction(a:Node,b:Node){const v=new Vec2(b.position.x-a.position.x,b.position.y-a.position.y);v.normalize();return v;}
  private makeModal(title:string,subtitle:string,height=360,width=620){this.modal=this.makeNode('Modal',this.ui,0,0,this.screenW,this.screenH);this.modal.addComponent(BlockInputEvents);this.addGraphics(this.modal,g=>{g.fillColor=new Color(0,0,0,175);g.rect(-this.screenW/2,-this.screenH/2,this.screenW,this.screenH);g.fill();});const card=this.panel(this.modal,0,0,Math.min(width,this.screenW-40),height,new Color(25,37,53,250),new Color(255,208,114));this.label(card,title,0,height/2-55,28,new Color(255,227,158),560,50);this.label(card,subtitle,0,height/2-97,18,new Color(219,237,232),520,38);return card;}
  private closeModal(){if(this.modal?.isValid)this.modal.destroy();this.modal=null;this.paused=false;this.updateChestGuide();}
  private addPet(id:PetId){const n=this.makeNode(`Pet_${id}`,this.world,this.player.position.x-42,this.player.position.y-42,54,54);const spr=n.addComponent(Sprite);spr.sizeMode=Sprite.SizeMode.CUSTOM;const fallback=this.makeNode('Fallback',n,0,0,54,54);this.addGraphics(fallback,g=>{g.fillColor=new Color(130,198,220);g.circle(0,0,17);g.fill();});const pet:Pet={id,node:n,sprite:spr,fallback,attackCd:.4};this.pets.push(pet);this.loadPetFrames(pet);}
  private petName(id:PetId){return ({fox:'狐狸',frog:'青蛙',dragonling:'幼龙',squirrel:'魔法松鼠'} as any)[id];}
  private petSkillName(id:PetId){return ({fox:'火球',frog:'水柱',dragonling:'熔岩长矛',squirrel:'落石'} as any)[id];}
  private refreshHud(){
    if(!this.hud.hp)return;
    this.hud.hp.string=`❤ ${Math.ceil(this.hp)}/${this.maxHp}`;this.hud.gold.string=`🪙 ${this.gold}`;this.hud.weapon.string=`⚔ ${W[this.weapon].name}`;this.hud.xp.string=`等级 ${this.playerLevel}/${MAX_LEVEL} · 攻击 +${this.xpCount*5}%`;this.hud.difficulty.string=`模式：${DIFF[this.difficulty].name}`;this.hud.stage.string=`进阶 ${this.evolution}/2`;
    this.refreshWeaponQuickbar();
    const boss=this.enemies.find(e=>e.boss&&e.alive);if(boss&&this.bossBar&&this.bossBarNode){this.bossBarNode.active=true;this.bossBar.clear();this.bossBar.fillColor=new Color(35,37,46,225);this.bossBar.roundRect(-190,-9,380,18,8);this.bossBar.fill();this.bossBar.fillColor=new Color(222,72,91);this.bossBar.roundRect(-188,-7,376*Math.max(0,boss.hp/boss.maxHp),14,6);this.bossBar.fill();this.hud.boss.string=`BOSS  ${Math.max(0,Math.ceil(boss.hp))}/${Math.ceil(boss.maxHp)}`;}else if(this.hud.boss&&this.bossCountdown<0&&!this.bossSpawned){this.hud.boss.string='';if(this.bossBarNode)this.bossBarNode.active=false;}
  }
  private showMessage(s:string){this.message=s;this.messageTime=2.2;if(this.hud.message)this.hud.message.string=s;}
  private finish(win:boolean){if(this.state==='result')return;this.state='result';this.paused=true;if(this.hud.boss)this.hud.boss.string='';if(this.bossBarNode?.isValid)this.bossBarNode.active=false;if(this.bossBar?.isValid)this.bossBar.clear();this.stopBgm();this.stopBossAudio();const resultKey=win?'victory':'failure';const resultClip=this.sfx[resultKey];this.playSfx(resultKey,.8);if(resultClip)this.scheduleOnce(()=>{if(this.state==='result'){this.bgmSuppressedForBoss=false;this.startBgm(true);}},Math.max(.1,resultClip.getDuration()));else{this.bgmSuppressedForBoss=false;this.startBgm(true);}const card=this.makeModal(win?'胜利':'挑战失败',win?'Boss 已被击败':'再收集一些金币，继续进阶');this.button(card,'再来一局',0,-30,230,72,()=>this.drawMenu(),new Color(36,148,117));this.label(card,`本局等级 ${this.playerLevel} · 击败 ${this.enemies.length} 个敌人`,0,-100,17,new Color(207,225,221),480,32);}
  private loadResource<T>(path:string,request:(done:(error:Error|null,value:T)=>void)=>void):Promise<T>{
    return new Promise<T>((resolve,reject)=>{
      let finished=false;
      const timeout=setTimeout(()=>{finished=true;reject(new Error(`${path} 加载超时`));},30000);
      request((error,value)=>{
        if(finished)return;finished=true;clearTimeout(timeout);
        if(!this.isValid){reject(new Error('加载已取消'));return;}
        if(error||!value){reject(new Error(`${path} 加载失败${error?`：${error.message}`:''}`));return;}
        resolve(value);
      });
    });
  }
  private loadTexture(path:string){return this.loadResource<Texture2D>(path,done=>resources.load(path,Texture2D,done));}
  private loadJson(path:string){return this.loadResource<JsonAsset>(path,done=>resources.load(path,JsonAsset,done));}
  private loadAudio(path:string){return this.loadResource<AudioClip>(path,done=>resources.load(path,AudioClip,done));}
  private async loadFrameSet(path:string){
    const frames=await this.loadResource<SpriteFrame[]>(path,done=>resources.loadDir(path,SpriteFrame,done));
    if(!frames.length)throw new Error(`${path} 动画为空`);
    return frames.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
  }
  private async loadInitialResources(){
    const attempt=++this.initialLoadAttempt;
    this.initialResourcesReady=false;this.drawLoadingScreen();
    try{
      await Promise.all([this.loadArt(),this.loadBgm(),this.loadSfx()]);
      if(!this.isValid||attempt!==this.initialLoadAttempt)return;
      this.initialResourcesReady=true;
      this.drawMenu();
      // Later encounters prepare in the background, with a gate at their actual entry points.
      void this.preparePetResources().catch(error=>console.warn('[PlayableAdGame] 宠物资源预载失败，可在开箱时重试',error));
      void this.prepareBossResources().catch(error=>console.warn('[PlayableAdGame] Boss资源预载失败，可在登场时重试',error));
    }catch(error){
      if(!this.isValid||attempt!==this.initialLoadAttempt)return;
      console.error('[PlayableAdGame] 初始资源加载失败',error);
      this.drawLoadingScreen('资源加载失败，请重试');
      this.label(this.ui,this.resourceErrorText(error),0,-82,13,new Color(255,180,170),Math.min(760,this.screenW-50),46);
      this.button(this.ui,'重新加载',0,-145,220,52,()=>{void this.loadInitialResources();});
    }
  }
  private resourceErrorText(error:unknown){return error instanceof Error?error.message:String(error);}
  private async loadArt(){
    const tasks:Promise<unknown>[]=[];
    tasks.push(this.loadTexture('game/tiles/OutdoorSampleMap/texture').then(tex=>{this.mapBackgroundTexture=tex;}));
    tasks.push(this.loadFrameSet('game/chest').then(frames=>{this.chestFrames=frames;}));
    const pickupRoot='game/pickups';
    const strips:[PickupKind,string,number][]=[['coin','coin',8],['xp','gem',8],['heart','heart',5]];
    for(const [kind,file,count] of strips)tasks.push(this.loadTexture(`${pickupRoot}/${file}/texture`).then(tex=>{
      const frames:SpriteFrame[]=[];
      for(let i=0;i<count;i++)frames.push(this.frame(tex,{x:i*32,y:0,w:32,h:32}));
      this.pickupFrames.set(kind,frames);
    }));
    const weaponPickupPaths:Record<WeaponId,string>={knife:'weapon_knife',handgun:'weapon_handgun',rifle:'weapon_rifle',shotgun:'weapon_shotgun'};
    for(const id of Object.keys(weaponPickupPaths) as WeaponId[])tasks.push(this.loadTexture(`${pickupRoot}/${weaponPickupPaths[id]}/texture`).then(tex=>{
      this.pickupFrames.set(id,[this.frame(tex,{x:0,y:0,w:tex.width,h:tex.height})]);
    }));
    const gunPaths:[string,(frames:SpriteFrame[])=>void][]=[
      ['game/effects/weapons/bullet_tracer',frames=>{this.gunTracerFrames=frames;}],
      ['game/effects/weapons/metal_impact',frames=>{this.gunImpactFrames=frames;}],
      ['game/effects/weapons/rifle_muzzle_flash',frames=>{this.muzzleFrames=frames;}],
    ];
    for(const [path,save] of gunPaths)tasks.push(this.loadFrameSet(path).then(save));
    const base='game/player/survivor';
    for(const weapon of ['knife','handgun','rifle','shotgun'] as WeaponId[]){
      const actions=weapon==='knife'?['idle','move','meleeattack']:['idle','move','shoot'];
      for(const action of actions)tasks.push(this.loadFrameSet(`${base}/${weapon}/${action}`).then(frames=>{
        this.survivorFrames.set(`${weapon}/${action}`,frames);
      }));
    }
    tasks.push(this.loadFrameSet(`${base}/feet/idle`).then(frames=>{this.feetIdleFrames=frames;}));
    tasks.push(this.loadFrameSet(`${base}/feet/run`).then(frames=>{this.feetRunFrames=frames;}));
    for(const kind of ['mushroom','eye','bat','plant'] as const)tasks.push(this.prepareEnemyFrames(kind));
    await Promise.all(tasks);
  }
  private async prepareEnemyFrames(kind:Exclude<EnemyKind,'boss'>){
    const path=`game/enemies/${kind}/sheet`;
    const [tex,data]=await Promise.all([this.loadTexture(`${path}/texture`),this.loadJson(path)]);
    const rows=(data.json as {frames:any[]}).frames;
    if(!Array.isArray(rows))throw new Error(`${path} 缺少动画帧数据`);
    const pack=kind==='bat'||kind==='plant';
    const framesFor=(action:string)=>rows.filter(f=>f.pixor?.action===action&&f.pixor?.side==='South')
      .sort((a,b)=>a.pixor.index-b.pixor.index).map(f=>pack?this.frameFromAtlas(tex,f.frame):this.frame(tex,f.frame));
    const cached={idle:framesFor('Idle'),walk:framesFor('Walk'),attack:pack?framesFor('Attack'):[]};
    if(pack?(!cached.idle.length||!cached.attack.length):(!cached.walk.length&&!cached.idle.length))throw new Error(`${path} 缺少必要动作`);
    this.enemyFrames.set(kind,cached);
  }
  private applyPickupArt(p:Pickup){const frames=this.pickupFrames.get(p.kind);if(!frames?.length||!p.node.isValid)return;p.fallback.active=false;if(frames.length>1){const index=Math.floor(Math.random()*frames.length);p.anim={node:p.node,sprite:p.sprite,frames,fps:p.kind==='heart'?8:p.kind==='coin'?14:10,clock:0,index};p.sprite.spriteFrame=frames[index];}else{p.anim=undefined;p.sprite.spriteFrame=frames[0];}}
  private async loadBgm(){this.bgm=await this.loadAudio('game/audio/bgm');}
  private async loadSoundFiles(files:Record<string,string>){
    await Promise.all(Object.entries(files).map(async([key,file])=>{this.sfx[key]=await this.loadAudio(`game/audio/${file}`);}));
  }
  private loadSfx(){
    return this.loadSoundFiles({attack:'attack',pickup:'pickup',chest:'chest',hit:'hit',victory:'success',failure:'lose',openChest:'open_chest',petGet:'get_pets',handgun:'pistol_shoot',rifle:'ak74_shoot',shotgun:'blast_shoot'});
  }
  private preparePetResources():Promise<void>{
    if(this.petResourcesReady)return Promise.resolve();
    if(this.petResourceTask)return this.petResourceTask;
    const tasks:Promise<unknown>[]=[];
    for(const id of ['fox','frog','dragonling','squirrel'] as PetId[]){
      const tier=id==='fox'||id==='frog'?'tier1':'tier2';
      tasks.push(this.loadTexture(`game/pets/${tier}/${id}/texture`).then(tex=>{
        const frames:SpriteFrame[]=[];
        for(let i=0;i<12;i++)frames.push(this.frame(tex,{x:i*88,y:88,w:88,h:88}));
        this.petFrames.set(id,frames);
      }));
      tasks.push(this.loadFrameSet(`game/effects/pets/${id}`).then(frames=>{this.petEffectFrames.set(id,frames);}));
    }
    tasks.push(this.loadSoundFiles({petFox:'fireball',petFrog:'waterspout',petDragonling:'lava_spear',petSquirrel:'stone'}));
    this.petResourceTask=Promise.all(tasks).then(()=>{this.petResourcesReady=true;}).catch(error=>{this.petResourceTask=null;throw error;});
    return this.petResourceTask;
  }
  private prepareBossResources():Promise<void>{
    if(this.bossResourcesReady)return Promise.resolve();
    if(this.bossResourceTask)return this.bossResourceTask;
    const sliceSheet=(tex:Texture2D)=>{
      const frames:SpriteFrame[]=[];
      for(let row=0;row<4;row++)for(let col=0;col<6;col++)frames.push(this.frame(tex,{x:col*203,y:row*203,w:203,h:203}));
      return frames;
    };
    this.bossResourceTask=Promise.all([
      this.loadTexture('game/boss/walk/texture').then(tex=>{this.bossWalkFrames=sliceSheet(tex);}),
      this.loadTexture('game/boss/attack/texture').then(tex=>{this.bossAttackFrames=sliceSheet(tex);}),
      this.loadSoundFiles({bossWarning:'boss_coming_sound',bossArrival:'boss_sound'}),
    ]).then(()=>{this.bossResourcesReady=true;if(this.bossAudioActive)this.startBossAudio();})
      .catch(error=>{this.bossResourceTask=null;throw error;});
    return this.bossResourceTask;
  }
  private removeStageModal(){if(this.modal?.isValid)this.modal.destroy();this.modal=null;}
  private showStageLoading(message:string){
    this.paused=true;this.resetJoystick();this.moveTouch=-1;this.removeStageModal();
    this.makeModal('努力加载中…',message);
  }
  private showStageLoadError(error:unknown,retry:()=>void){
    this.removeStageModal();this.paused=true;
    const card=this.makeModal('资源加载失败','请重试，或返回主页面');
    this.label(card,this.resourceErrorText(error),0,15,13,new Color(255,180,170),540,70);
    this.button(card,'重试',-130,-85,210,52,retry);
    this.button(card,'返回主页面',130,-85,210,52,()=>this.drawMenu());
  }
  private startBossAudio(){
    if(!this.bossAudioActive||this.state!=='playing'||this.muted)return;
    const loops:[AudioSource,string,number][]=[[this.bossWarningLoopSource,'bossWarning',.6],[this.bossRoarLoopSource,'bossArrival',.8]];
    for(const [source,key,volume] of loops){const clip=this.sfx[key];if(!source?.isValid||!clip||source.playing)continue;source.clip=clip;source.loop=true;source.volume=volume;source.play();}
  }
  private setBossAudioVolume(multiplier:number){if(this.bossWarningLoopSource?.isValid)this.bossWarningLoopSource.volume=.6*multiplier;if(this.bossRoarLoopSource?.isValid)this.bossRoarLoopSource.volume=.8*multiplier;}
  private stopBossAudio(){for(const source of [this.bossWarningLoopSource,this.bossRoarLoopSource])if(source?.isValid)source.stop();this.bossAudioActive=false;}
  private startBgm(restart=false){
    if(!this.playBgm||!this.bgm||this.muted||this.bgmSuppressedForBoss||this.state==='loading'||!this.bgmSource?.isValid)return;
    if(restart)this.bgmSource.stop();
    if(!this.bgmSource.playing){this.bgmSource.clip=this.bgm;this.bgmSource.loop=true;this.bgmSource.volume=.35;this.bgmSource.play();this.wasBgmStarted=true;}
  }
  private stopBgm(){if(this.bgmSource?.isValid){this.bgmSource.stop();this.wasBgmStarted=false;}}
  private playSfx(key:string, volume=0.45){if(this.muted)return;const clip=this.sfx[key];if(clip)this.audioSource.playOneShot(clip,volume);}
  private playWeaponSfx(weapon:WeaponId){if(weapon==='knife'){this.playSfx('attack',.16);return;}const volumes:Record<'handgun'|'rifle'|'shotgun',number>={handgun:.36,rifle:.42,shotgun:.5};this.playSfx(weapon,volumes[weapon]);}
  private loadPlayerFrames(){ this.setPlayerLocomotion(false); }
  private updatePlayerFacing(){ /* Facing follows movement; auto-attacks rotate toward the selected target. */ }
  private facePlayer(dx:number,dy:number){if(Math.hypot(dx,dy)<.001)return;const degrees=Math.atan2(dy,dx)*180/Math.PI;this.facingAngle=degrees;this.playerVisual.setRotationFromEuler(0,0,degrees);}
  private setPlayerLocomotion(moving:boolean){
    if (!this.player?.isValid || this.playerActionRemaining > 0) return;
    const body=this.survivorFrames.get(`${this.weapon}/${moving?'move':'idle'}`);
    if (body?.length) { this.playerSprite.spriteFrame=body[0]; this.playerFallback.active=false; this.setAnimFrames('body',body,moving?12:8); }
    const feet=moving?this.feetRunFrames:this.feetIdleFrames;
    if (feet.length) { this.playerFeetSprite.spriteFrame=feet[0]; this.playerFeetFallback.active=false; this.setAnimFrames('feet',feet,moving?12:1); }
  }
  private setAnimFrames(which:'body'|'feet',frames:SpriteFrame[],fps:number){
    let anim=which==='body'?this.playerBodyAnim:this.playerFeetAnim;
    const node=which==='body'?this.playerSprite.node:this.playerFeetSprite.node; const sprite=which==='body'?this.playerSprite:this.playerFeetSprite;
    if(!anim){anim={node,sprite,frames,fps,clock:0};if(which==='body')this.playerBodyAnim=anim;else this.playerFeetAnim=anim;this.animations.push(anim);}
    else {anim.frames=frames;anim.fps=fps;anim.clock=0;}
  }
  private playPlayerAction(action:'meleeattack'|'shoot',duration:number){
    const frames=this.survivorFrames.get(`${this.weapon}/${action}`); if(!frames?.length)return;
    this.playerActionRemaining=duration; this.playerSprite.spriteFrame=frames[0]; this.setAnimFrames('body',frames,Math.max(8,frames.length/duration));
    if(this.playerBodyAnim)this.playerBodyAnim.index=0;
  }
  private facing(){if(Math.abs(this.move.x)>Math.abs(this.move.y))return this.move.x<0?'west':'east';return this.move.y<0?'south':'north';}
  private frame(tex:Texture2D,f:any){const s=new SpriteFrame();s.texture=tex;s.rect=new Rect(f.x,tex.height-f.y-f.h,f.w,f.h);return s;}
  private frameFromAtlas(tex:Texture2D,f:{x:number;y:number;w:number;h:number}){
    // Pixor JSON and Cocos SpriteFrame rectangles both use top-left coordinates.
    // Inverting y selects another row, including transparent padding cells.
    const spriteFrame=new SpriteFrame();spriteFrame.texture=tex;
    spriteFrame.rect=new Rect(f.x,f.y,f.w,f.h);return spriteFrame;
  }
  private loadPetFrames(pet:Pet){
    const frames=this.petFrames.get(pet.id);
    if(!frames?.length||!pet.node.isValid)return;
    pet.sprite.spriteFrame=frames[0];pet.fallback.active=false;
    pet.anim={node:pet.node,sprite:pet.sprite,frames,fps:9,clock:0};
  }
  private applyCachedEnemyFrames(e:Enemy,kind:Exclude<EnemyKind,'boss'>,pack:boolean){
    const cached=this.enemyFrames.get(kind);
    if(!cached||!e.alive||!e.node.isValid)return;
    const frames=pack?cached.idle:cached.walk.length?cached.walk:cached.idle;
    e.idleFrames=cached.idle;e.attackFrames=cached.attack;e.walkFrames=cached.walk;
    e.sprite.spriteFrame=frames[0];e.fallback.active=false;
    e.anim={node:e.node,sprite:e.sprite,frames,fps:kind==='plant'?9:12,clock:0};this.animations.push(e.anim);
  }
  private loadEnemyFrames(e:Enemy,kind:'mushroom'|'eye'){this.applyCachedEnemyFrames(e,kind,false);}
  private loadEnemyPackFrames(e:Enemy,kind:'bat'|'plant'){this.applyCachedEnemyFrames(e,kind,true);}
  private loadBossFrames(e:Enemy){
    if(!this.bossResourcesReady||!e.alive||!e.node.isValid)return;
    e.walkFrames=this.bossWalkFrames;e.attackFrames=this.bossAttackFrames;e.bossDirectionRow=this.bossDirectionRow(e);
    const frames=e.walkFrames.slice(e.bossDirectionRow*6,e.bossDirectionRow*6+6);
    e.sprite.spriteFrame=frames[0];e.fallback.active=false;
    e.anim={node:e.node,sprite:e.sprite,frames,fps:10,clock:0};this.animations.push(e.anim);
  }
  // The sheet's four direction rows are opposite to their nominal orientation in the rendered texture.
  private bossDirectionRow(e:Enemy){const dx=this.player.position.x-e.node.position.x,dy=this.player.position.y-e.node.position.y;if(Math.abs(dx)>Math.abs(dy))return dx<0?2:1;return dy<0?3:0;}
  private updateBossDirection(e:Enemy){if(!e.anim||!e.walkFrames?.length)return;const row=this.bossDirectionRow(e);if(row===e.bossDirectionRow)return;e.bossDirectionRow=row;const frames=e.walkFrames.slice(row*6,row*6+6);e.anim.frames=frames;e.anim.clock=0;e.anim.index=0;e.sprite.spriteFrame=frames[0];}
  private animate(dt:number){
    for(const e of this.enemies){
      // Dead enemies stay in the list for the end-of-run count, but their
      // nodes are destroyed. Never advance their attack animation afterward.
      if(!e.alive||!e.node.isValid)continue;
      if(e.attackRemaining>0){
        e.attackRemaining-=dt;
        if(e.attackRemaining<=0&&e.anim){
          const base=e.idleFrames?.length?e.idleFrames:e.walkFrames;
          if(base?.length){
            const frames=e.boss?base.slice((e.bossDirectionRow??0)*6,(e.bossDirectionRow??0)*6+6):base;
            e.anim.frames=frames;e.anim.clock=0;e.anim.index=0;e.sprite.spriteFrame=frames[0];
          }
        }
      }
    }
    for(const a of this.animations){if(!a.node.isValid||!a.frames.length)continue;a.clock+=dt;while(a.clock>=1/a.fps){a.clock-=1/a.fps;a.index=((a.index??0)+1)%a.frames.length;a.sprite.spriteFrame=a.frames[a.index];}}
    this.animations=this.animations.filter(a=>a.node.isValid);
  }
  private joystickScreenX(){return this.screenW*.42;}
  private joystickScreenY(){return this.screenH*.38;}
  private onTouchStart(e:EventTouch){if(this.state==='loading'||this.state==='menu'||this.modal)return;const p=e.getUILocation();if(this.isJoystickPoint(p.x,p.y)){this.moveTouch=e.getID();this.pointerDown=true;this.touchOrigin.set(this.joystickScreenX(),this.joystickScreenY());this.setMoveFrom(p.x,p.y);}}
  private onTouchMove(e:EventTouch){if(e.getID()!==this.moveTouch)return;const p=e.getUILocation();this.setMoveFrom(p.x,p.y);}
  private onTouchEnd(e:EventTouch){if(e.getID()===this.moveTouch){this.moveTouch=-1;this.resetJoystick();}}
  private onMouseDown(e:EventMouse){if(this.state==='loading'||this.state==='menu'||this.modal)return;const p=e.getUILocation();if(this.isJoystickPoint(p.x,p.y)){this.pointerDown=true;this.touchOrigin.set(this.joystickScreenX(),this.joystickScreenY());this.setMoveFrom(p.x,p.y);}}
  private onMouseMove(e:EventMouse){if(!this.pointerDown)return;const p=e.getUILocation();this.setMoveFrom(p.x,p.y);}
  private onMouseUp(){this.resetJoystick();}
  private isJoystickPoint(x:number,y:number){return Math.hypot(x-this.joystickScreenX(),y-this.joystickScreenY())<76;}
  private resetJoystick(){this.pointerDown=false;this.move.set(0,0);this.joystickKnob?.setPosition(0,0,0);}
  private setMoveFrom(x:number,y:number){const v=new Vec2(x-this.touchOrigin.x,y-this.touchOrigin.y);const len=v.length();if(len>54)v.multiplyScalar(54/len);this.move.set(v.x/54,v.y/54);this.joystickKnob?.setPosition(v.x,v.y,0);if(Math.abs(this.move.x)>.08)this.petFacingLeft=this.move.x<0;}
}
