def j(x) = JSON.generate(x)
def try
  yield
rescue StandardError => e
  puts "  !! #{e.message[0, 700]}"
end
bs = Spaceship::ConnectAPI::App.find("com.gorillastocks.blackspire")
asc_call(:get, "apps/#{bs.id}/reviewSubmissions", nil, { limit: 10 })["data"].each do |s|
  puts "sub #{s['id']} #{j(s['attributes'])}"
  try { asc_call(:get, "reviewSubmissions/#{s['id']}/items", nil, { limit: 20 })["data"].each { |i| puts "  item #{j(i['attributes'])} rels=#{i['relationships'].map { |k, v| v['data'] ? k : nil }.compact.join(',')}" } }
end
try { x = asc_call(:get, "apps/#{bs.id}/inAppPurchasesV2")["data"].first; puts j(x["attributes"].slice("state", "inAppPurchaseType")); puts "iap rels with data: " + x["relationships"].map { |k, v| v["data"] ? k : nil }.compact.join(",") }
try { v = asc_call(:get, "apps/#{bs.id}/appStoreVersions", nil, { limit: 2 })["data"].first; puts "bs version rels: " + asc_call(:get, "appStoreVersions/#{v['id']}", nil, { include: "appStoreVersionSubmission" })["data"]["relationships"].map { |k, vv| "#{k}:#{vv['data'] ? 'Y' : 'n'}" }.join(",") }
