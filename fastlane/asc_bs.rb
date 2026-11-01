# Read-only: how the Blackspire app (same account) is configured; contact details are never printed.
def j(x) = JSON.generate(x)
def try
  yield
rescue StandardError => e
  puts "  !! #{e.message[0, 300]}"
  nil
end
bs = Spaceship::ConnectAPI::App.find("com.gorillastocks.blackspire")
puts "blackspire app #{bs.id}"
puts j(asc_call(:get, "apps/#{bs.id}")["data"]["attributes"].slice("name", "contentRightsDeclaration", "primaryLocale"))
vs = asc_call(:get, "apps/#{bs.id}/appStoreVersions", nil, { limit: 5 })["data"]
vs.each do |v|
  puts "ver #{v['id']} #{j(v['attributes'].slice('versionString', 'appStoreState', 'releaseType', 'copyright'))}"
  try do
    r = asc_call(:get, "appStoreVersions/#{v['id']}/appStoreReviewDetail")["data"]
    if r
      a = r["attributes"]
      puts "  review detail keys: " + a.map { |k, val| "#{k}=#{k =~ /contact/i ? (val.to_s.empty? ? 'EMPTY' : 'SET') : val.inspect[0, 700]}" }.join(" | ")
      try { puts "  attachments: " + asc_call(:get, "appStoreReviewDetails/#{r['id']}/appStoreReviewAttachments")["data"].map { |x| x["attributes"].slice("fileName", "fileSize").to_s }.join(",") }
    end
  end
  try { puts "  build: " + (asc_call(:get, "appStoreVersions/#{v['id']}/build")["data"] || {}).dig("attributes", "version").to_s }
end
bs_infos = asc_call(:get, "apps/#{bs.id}/appInfos")["data"]
bs_infos.each do |i|
  puts "info #{i['id']} #{j(i['attributes'].slice('state', 'appStoreAgeRating'))}"
  try { puts "  rel: " + j(asc_call(:get, "appInfos/#{i['id']}")["data"]["relationships"].transform_values { |v| v.dig("data", "id") }.compact) }
  try { puts "  age: " + j(asc_call(:get, "appInfos/#{i['id']}/ageRatingDeclaration")["data"]["attributes"]) }
  try { asc_call(:get, "appInfos/#{i['id']}/appInfoLocalizations")["data"].each { |l| puts "  loc #{j(l['attributes'].slice('locale', 'subtitle', 'privacyPolicyUrl'))}" } }
end
try { puts "availability: " + j(asc_call(:get, "apps/#{bs.id}/appAvailabilityV2", nil, { include: "territoryAvailabilities", limit: 3 })["data"]) }
try { puts "price sched: " + j(asc_call(:get, "apps/#{bs.id}/appPriceSchedule", nil, { include: "baseTerritory,manualPrices" })["data"]) }
try { puts "reviewSubmissions: " + asc_call(:get, "apps/#{bs.id}/reviewSubmissions", nil, { limit: 10 })["data"].map { |x| j(x["attributes"]) }.join(" | ") }
