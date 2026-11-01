# Prepare (and optionally submit) Abandoned Dunes 1.0 for App Review via the App Store Connect API.
# MODE=inspect : read-only status.   MODE=prepare : fill everything.   MODE=submit : prepare + submit for review.
# Never prints secrets or contact details. Idempotent.
require "digest"
require "net/http"
ROOT = File.expand_path("..", __dir__)
APP = $asc_app_id
MODE = ENV.fetch("MODE", "inspect")
def j(x) = JSON.generate(x)
def say(s) = puts("▶ #{s}")
$problems = []
def step(name)
  say(name)
  yield
rescue StandardError => e
  $problems << "#{name}: #{e.message[0, 500]}"
  puts "  !! #{name}: #{e.message[0, 700]}"
  nil
end

def rel(type, id) = { data: { type: type, id: id } }

def upload_ops(ops, bytes)
  (ops || []).each do |op|
    uri = URI(op["url"])
    req = Net::HTTP::Put.new(uri)
    (op["requestHeaders"] || []).each { |h| req[h["name"]] = h["value"] }
    req.body = bytes.byteslice(op["offset"], op["length"])
    res = Net::HTTP.start(uri.host, uri.port, use_ssl: true, read_timeout: 300) { |h| h.request(req) }
    raise "chunk upload HTTP #{res.code}" unless res.code.to_i.between?(200, 299)
  end
end

ver = asc_call(:get, "apps/#{APP}/appStoreVersions", nil, { limit: 10 })["data"].find { |v| v["attributes"]["versionString"] == "1.0" }
VID = ver["id"]
say "version #{VID} state=#{ver['attributes']['appStoreState']}"
info = asc_call(:get, "apps/#{APP}/appInfos")["data"].first
INFO = info["id"]

desc = File.read(File.join(ROOT, "store/description.txt")).strip
notes = File.read(File.join(ROOT, "store/review_notes.txt")).strip

step("content rights + copyright + release type") do
  asc_call(:patch, "apps/#{APP}", { data: { type: "apps", id: APP, attributes: { contentRightsDeclaration: "USES_THIRD_PARTY_CONTENT" } } })
  asc_call(:patch, "appStoreVersions/#{VID}", { data: { type: "appStoreVersions", id: VID, attributes: { copyright: "2026 Sean Ho", releaseType: "AFTER_APPROVAL" } } })
end

step("version localization (description, keywords, URLs, promo text, what's new)") do
  loc = asc_call(:get, "appStoreVersions/#{VID}/appStoreVersionLocalizations")["data"].find { |l| l["attributes"]["locale"] == "en-US" }
  asc_call(:patch, "appStoreVersionLocalizations/#{loc['id']}", { data: { type: "appStoreVersionLocalizations", id: loc["id"], attributes: {
    description: desc,
    keywords: "golf,slingshot,links,dunes,coast,wind,putting,fairway,offline,3d,sports,leaderboard,gorse",
    supportUrl: "https://gorillastocks.github.io/bandon-golf/docs/support.html",
    marketingUrl: "https://gorillastocks.github.io/bandon-golf/",
    promotionalText: "Pull back, release, and carry the wind across seven parody links courses. Free to try: the first five holes are on us. No ads, no tracking, play offline.",
    whatsNew: "First release. Seven parody courses, three difficulty levels, Game Center leaderboards, achievements and friend matches."
  } } })
  $loc_id = loc["id"]
end

step("app info: subtitle, privacy policy URL, categories") do
  l = asc_call(:get, "appInfos/#{INFO}/appInfoLocalizations")["data"].find { |x| x["attributes"]["locale"] == "en-US" }
  asc_call(:patch, "appInfoLocalizations/#{l['id']}", { data: { type: "appInfoLocalizations", id: l["id"], attributes: {
    subtitle: "Slingshot golf on wild links", privacyPolicyUrl: "https://gorillastocks.github.io/bandon-golf/docs/privacy.html" } } })
  asc_call(:patch, "appInfos/#{INFO}", { data: { type: "appInfos", id: INFO, relationships: {
    primaryCategory: rel("appCategories", "GAMES"), primarySubcategoryOne: rel("appCategories", "GAMES_SPORTS"),
    secondaryCategory: rel("appCategories", "SPORTS") } } })
end

step("age rating declaration") do
  d = asc_call(:get, "appInfos/#{INFO}/ageRatingDeclaration")["data"]
  none = %w[alcoholTobaccoOrDrugUseOrReferences contests gamblingSimulated gunsOrOtherWeapons medicalOrTreatmentInformation profanityOrCrudeHumor
            sexualContentGraphicAndNudity sexualContentOrNudity horrorOrFearThemes matureOrSuggestiveThemes violenceCartoonOrFantasy
            violenceRealistic violenceRealisticProlongedGraphicOrSadistic]
  bools = %w[advertising gambling healthOrWellnessTopics lootBox messagingAndChat parentalControls ageAssurance socialMedia
             unrestrictedWebAccess userGeneratedContent]
  attrs = {}
  none.each { |k| attrs[k] = "NONE" if d["attributes"].key?(k) }
  bools.each { |k| attrs[k] = false if d["attributes"].key?(k) }
  attrs["socialMediaAgeRestricted"] = false if d["attributes"].key?("socialMediaAgeRestricted")
  r = asc_call(:patch, "ageRatingDeclarations/#{d['id']}", { data: { type: "ageRatingDeclarations", id: d["id"], attributes: attrs } })
  puts "  age rating attrs set: #{attrs.size}"
  i = asc_call(:get, "appInfos/#{INFO}")["data"]["attributes"]
  puts "  appStoreAgeRating=#{i['appStoreAgeRating']}"
end

step("app availability (all territories) + free price") do
  have = begin
    asc_call(:get, "apps/#{APP}/appAvailabilityV2")["data"]
  rescue StandardError
    nil
  end
  if have
    puts "  availability already set"
  else
    terrs = []
    cursor = nil
    loop do
      q = { limit: 200 }
      q[:cursor] = cursor if cursor
      r = asc_call(:get, "territories", nil, q)
      terrs += r["data"].map { |t| t["id"] }
      nxt = r.dig("links", "next")
      break if nxt.nil?
      cursor = URI.decode_www_form(URI(nxt).query).to_h["cursor"]
      break if cursor.nil?
    end
    inc = terrs.each_with_index.map { |t, i| { type: "territoryAvailabilities", id: "${t#{i}}", attributes: { available: true }, relationships: { territory: rel("territories", t) } } }
    asc_call(:post, "v2/appAvailabilities", { data: { type: "appAvailabilities", attributes: { availableInNewTerritories: true },
      relationships: { app: rel("apps", APP), territoryAvailabilities: { data: inc.map { |x| { type: "territoryAvailabilities", id: x[:id] } } } } }, included: inc })
    puts "  availability set for #{terrs.size} territories"
  end
  has_price = begin
    s = asc_call(:get, "apps/#{APP}/appPriceSchedule")["data"]
    s && asc_call(:get, "appPriceSchedules/#{s['id']}/manualPrices", nil, { limit: 5 })["data"].to_a.any?
  rescue StandardError
    false
  end
  if has_price
    puts "  price schedule exists"
  else
    pts = asc_call(:get, "apps/#{APP}/appPricePoints", nil, { "filter[territory]" => "USA", limit: 200 })["data"]
    free = pts.find { |p| p["attributes"]["customerPrice"].to_f == 0.0 } or raise "no free price point"
    asc_call(:post, "appPriceSchedules", { data: { type: "appPriceSchedules", relationships: { app: rel("apps", APP), baseTerritory: rel("territories", "USA"),
      manualPrices: { data: [{ type: "appPrices", id: "${p1}" }] } } },
      included: [{ type: "appPrices", id: "${p1}", attributes: { startDate: nil }, relationships: { appPricePoint: rel("appPricePoints", free["id"]) } }] })
    puts "  free price set"
  end
end

SHOTS = [
  ["APP_IPHONE_69", "store/screenshots2/iphone-6.9-portrait-1320x2868"],
  ["APP_IPAD_PRO_3GEN_129", "store/screenshots2/ipad-13-portrait-2064x2752"],
].freeze
step("screenshots") do
  loc_id = asc_call(:get, "appStoreVersions/#{VID}/appStoreVersionLocalizations")["data"].find { |l| l["attributes"]["locale"] == "en-US" }["id"]
  sets = asc_call(:get, "appStoreVersionLocalizations/#{loc_id}/appScreenshotSets")["data"]
  SHOTS.each do |dtype, dir|
    files = Dir[File.join(ROOT, dir, "*.{png,jpg}")].sort
    next puts("  no files for #{dtype}") if files.empty?
    begin
      set = sets.find { |s| s["attributes"]["screenshotDisplayType"] == dtype }
      set ||= asc_call(:post, "appScreenshotSets", { data: { type: "appScreenshotSets", attributes: { screenshotDisplayType: dtype },
        relationships: { appStoreVersionLocalization: rel("appStoreVersionLocalizations", loc_id) } } })["data"]
      asc_call(:get, "appScreenshotSets/#{set['id']}/appScreenshots")["data"].each { |x| asc_call(:delete, "appScreenshots/#{x['id']}") }
      ids = []
      files.each do |f|
        bytes = File.binread(f)
        c = asc_call(:post, "appScreenshots", { data: { type: "appScreenshots", attributes: { fileName: File.basename(f), fileSize: bytes.bytesize },
          relationships: { appScreenshotSet: rel("appScreenshotSets", set["id"]) } } })["data"]
        upload_ops(c["attributes"]["uploadOperations"], bytes)
        asc_call(:patch, "appScreenshots/#{c['id']}", { data: { type: "appScreenshots", id: c["id"], attributes: { uploaded: true, sourceFileChecksum: Digest::MD5.hexdigest(bytes) } } })
        ids << c["id"]
      end
      sleep 8
      states = asc_call(:get, "appScreenshotSets/#{set['id']}/appScreenshots")["data"].map { |x| x["attributes"]["assetDeliveryState"]["state"] + (x["attributes"]["assetDeliveryState"]["errors"].to_a.empty? ? "" : "(#{x['attributes']['assetDeliveryState']['errors'].map { |e| e['code'] }.join('/')})") }
      puts "  #{dtype}: #{files.size} uploaded, states=#{states.join(',')}"
    rescue StandardError => e
      $problems << "screenshots #{dtype}: #{e.message[0, 400]}"
      puts "  !! #{dtype}: #{e.message[0, 500]}"
    end
  end
end

step("attach build 6") do
  b = asc_call(:get, "builds", nil, { "filter[app]" => APP, "filter[version]" => "6", limit: 5 })["data"].first or raise "build 6 not found"
  raise "build 6 state #{b['attributes']['processingState']}" unless b["attributes"]["processingState"] == "VALID"
  asc_call(:patch, "appStoreVersions/#{VID}/relationships/build", { data: { type: "builds", id: b["id"] } })
  puts "  attached build #{b['attributes']['version']} (usesNonExemptEncryption=#{b['attributes']['usesNonExemptEncryption'].inspect})"
  if b["attributes"]["usesNonExemptEncryption"].nil?
    asc_call(:patch, "builds/#{b['id']}", { data: { type: "builds", id: b["id"], attributes: { usesNonExemptEncryption: false } } })
    puts "  set usesNonExemptEncryption=false"
  end
end

step("App Review details + notes + attachment") do
  bs = Spaceship::ConnectAPI::App.find("com.gorillastocks.blackspire")
  src = nil
  asc_call(:get, "apps/#{bs.id}/appStoreVersions", nil, { limit: 5 })["data"].each do |v|
    r = asc_call(:get, "appStoreVersions/#{v['id']}/appStoreReviewDetail")["data"]
    (src = r["attributes"]; break) if r && !r["attributes"]["contactEmail"].to_s.empty?
  end
  existing = asc_call(:get, "appStoreVersions/#{VID}/appStoreReviewDetail")["data"]
  attrs = { notes: notes, demoAccountRequired: false }
  if src
    %w[contactFirstName contactLastName contactPhone contactEmail].each { |k| attrs[k.to_sym] = src[k] }
  elsif existing.nil?
    raise "no contact details available to copy"
  end
  if existing
    asc_call(:patch, "appStoreReviewDetails/#{existing['id']}", { data: { type: "appStoreReviewDetails", id: existing["id"], attributes: attrs } })
    rid = existing["id"]
  else
    rid = asc_call(:post, "appStoreReviewDetails", { data: { type: "appStoreReviewDetails", attributes: attrs, relationships: { appStoreVersion: rel("appStoreVersions", VID) } } })["data"]["id"]
  end
  puts "  review detail #{rid} saved (contact copied from the Blackspire app's review contact: #{src ? 'yes' : 'no'})"
  vid_path = File.join(ROOT, "store/review/abandoned-dunes-app-review.mp4")
  if File.exist?(vid_path)
    old = asc_call(:get, "appStoreReviewDetails/#{rid}/appStoreReviewAttachments")["data"]
    old.each { |a| asc_call(:delete, "appStoreReviewAttachments/#{a['id']}") }
    bytes = File.binread(vid_path)
    c = asc_call(:post, "appStoreReviewAttachments", { data: { type: "appStoreReviewAttachments", attributes: { fileName: File.basename(vid_path), fileSize: bytes.bytesize },
      relationships: { appStoreReviewDetail: rel("appStoreReviewDetails", rid) } } })["data"]
    upload_ops(c["attributes"]["uploadOperations"], bytes)
    asc_call(:patch, "appStoreReviewAttachments/#{c['id']}", { data: { type: "appStoreReviewAttachments", id: c["id"], attributes: { uploaded: true, sourceFileChecksum: Digest::MD5.hexdigest(bytes) } } })
    sleep 5
    a = asc_call(:get, "appStoreReviewAttachments/#{c['id']}")["data"]["attributes"]
    puts "  attachment #{a['fileName']} #{a['fileSize']} bytes state=#{a.dig('assetDeliveryState', 'state')}"
  else
    puts "  (no recording file in repo)"
  end
end

step("Game Center: enable for version + release leaderboards/achievements") do
  gcd = asc_call(:get, "apps/#{APP}/gameCenterDetail")["data"]
  begin
    asc_call(:get, "gameCenterDetails/#{gcd['id']}/gameCenterAppVersions", nil, { limit: 20 })["data"].each { |x| puts "  existing gcAppVersion #{x['id']} #{j(x['attributes'])}" }
  rescue StandardError => e
    puts "  list gcAppVersions: #{e.message[0, 200]}"
  end
  begin
    r = asc_call(:post, "gameCenterAppVersions", { data: { type: "gameCenterAppVersions", attributes: { enabled: true },
      relationships: { appStoreVersion: rel("appStoreVersions", VID) } } })
    puts "  gameCenterAppVersion #{r['data']['id']} #{j(r['data']['attributes'])}"
  rescue StandardError => e
    puts "  create gcAppVersion: #{e.message[0, 400]}"
    raise unless e.message =~ /already|exist|conflict|ENTITY_ERROR/i
  end
  lbs = asc_call(:get, "gameCenterDetails/#{gcd['id']}/gameCenterLeaderboards", nil, { limit: 200 })["data"]
  achs = asc_call(:get, "gameCenterDetails/#{gcd['id']}/gameCenterAchievements", nil, { limit: 200 })["data"]
  puts "  #{lbs.size} leaderboards, #{achs.size} achievements"
  fails = 0
  lbs.each do |lb|
    begin
      asc_call(:post, "gameCenterLeaderboardReleases", { data: { type: "gameCenterLeaderboardReleases", relationships: { gameCenterDetail: rel("gameCenterDetails", gcd["id"]), gameCenterLeaderboard: rel("gameCenterLeaderboards", lb["id"]) } } })
    rescue StandardError => e
      fails += 1
      puts "  lb release #{lb['attributes']['vendorIdentifier']}: #{e.message[0, 250]}" if fails <= 3
    end
  end
  achs.each do |a|
    begin
      asc_call(:post, "gameCenterAchievementReleases", { data: { type: "gameCenterAchievementReleases", relationships: { gameCenterDetail: rel("gameCenterDetails", gcd["id"]), gameCenterAchievement: rel("gameCenterAchievements", a["id"]) } } })
    rescue StandardError => e
      fails += 1
      puts "  ach release #{a['attributes']['vendorIdentifier']}: #{e.message[0, 250]}" if fails <= 6
    end
  end
  puts "  release failures: #{fails}"
end

step("In-App Purchase: submit with the version") do
  iap = asc_call(:get, "apps/#{APP}/inAppPurchasesV2", nil, { "filter[productId]" => "com.gorillastocks.abandoneddunes.fullgame" })["data"].first
  puts "  IAP #{iap['id']} state=#{iap['attributes']['state']}"
  if iap["attributes"]["state"] == "READY_TO_SUBMIT"
    asc_call(:post, "inAppPurchaseSubmissions", { data: { type: "inAppPurchaseSubmissions", relationships: { inAppPurchaseV2: rel("inAppPurchases", iap["id"]) } } })
    puts "  IAP submitted"
    puts "  state now #{asc_call(:get, "v2/inAppPurchases/#{iap['id']}")['data']['attributes']['state']}"
  end
end

say "PREPARE DONE; problems=#{$problems.size}"
$problems.each { |p| puts "  PROBLEM: #{p}" }

if MODE == "submit"
  step("submit for review") do
    subs = asc_call(:get, "apps/#{APP}/reviewSubmissions", nil, { "filter[state]" => "READY_FOR_REVIEW,WAITING_FOR_REVIEW,IN_REVIEW,UNRESOLVED_ISSUES", limit: 10 })["data"]
    sub = subs.find { |s| s["attributes"]["state"] == "READY_FOR_REVIEW" }
    sub ||= asc_call(:post, "reviewSubmissions", { data: { type: "reviewSubmissions", attributes: { platform: "IOS" }, relationships: { app: rel("apps", APP) } } })["data"]
    puts "  submission #{sub['id']} state=#{sub['attributes']['state']}"
    items = asc_call(:get, "reviewSubmissions/#{sub['id']}/items", nil, { limit: 20 })["data"]
    if items.empty?
      asc_call(:post, "reviewSubmissionItems", { data: { type: "reviewSubmissionItems", relationships: { reviewSubmission: rel("reviewSubmissions", sub["id"]), appStoreVersion: rel("appStoreVersions", VID) } } })
    end
    r = asc_call(:patch, "reviewSubmissions/#{sub['id']}", { data: { type: "reviewSubmissions", id: sub["id"], attributes: { submitted: true } } })
    puts "  SUBMITTED state=#{r['data']['attributes']['state']}"
  end
  v = asc_call(:get, "appStoreVersions/#{VID}")["data"]["attributes"]
  puts "FINAL version state=#{v['appStoreState']} releaseType=#{v['releaseType']}"
end
