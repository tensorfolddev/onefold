// Everyday words for memorable passwords: short, easy to spell, nothing rude. About 1,100 of them, so each word adds
// about 10 bits — four words plus a number separator is far stronger than most typed passwords.
// ponytail: a hand-picked list, not EFF's 7,776-word one; switch to that if longer passphrases are ever wanted.
const LIST = `
able acid acorn actor adapt admit adult agent agree ahead aisle alarm album alert alien alley allow alpha amber amount
amuse angle ankle apple apron arena armor arrow artist atlas atom attic audio aunt autumn avoid awake award axis
baby bacon badge bagel baker balance ball bamboo banana band banjo bank barn barrel basil basket batch beach beacon
bead beam bean bear beard beaver bee beef bell belt bench berry bike bird birch bison blade blank blanket blaze blend
blink block bloom blossom blue blush board boat body bolt bone bonus book boost boot border bottle bounce bowl brain
branch brave bread breeze brick bride bridge brief bright brook broom brush bubble bucket buddy budget buffalo bugle
build bulb bundle bunny burger butter button buzz cabin cable cactus cake calm camel camera camp canal candle candy
canoe canvas canyon cape captain carbon card cargo carpet carrot cart castle cave cedar celery cello cereal chair
chalk champ charm chart cheek cheese chef cherry chess chest chicken chief chili chimney chin chip choir chorus cider
cinema circle circus citrus city clam clap clay clean clerk cliff climb clock cloud clover clown coach coast coat
cobra cocoa coconut code coffee coin comet comic copper coral corn cotton couch cougar count cousin cover cowboy coyote
crab craft crane crater crayon cream credit creek crew cricket crisp crown crumb crystal cube curry curtain curve
cushion cycle daisy dance dancer dart dash dawn deck deer delta denim depth desert desk detail dial diamond diary
diesel dinner dish diver dock doctor dollar dolphin domain donkey donut door dove dragon drama dream dress drift drill
drink drum duck dune dust eager eagle early earth easel echo eclipse edge effort elbow elder ember emerald empire
energy engine entry equal essay event exam exit extra fabric face fact falcon family farm fashion feast feather fence
fern ferry fiber field film final finch finger fire fish flag flame flash flask fleet flight float flock flower flute
focus folder forest fork fossil fox frame fresh frog frost fruit fudge funnel gadget galaxy game garage garden garlic
gate gear gecko gem genius giant ginger giraffe glass glider globe glove glow goat gold golf goose gorilla grain grape
graph grass gravel gravy green grid grill grin group grove guard guest guide guitar gull habit hammer hamster hand
harbor harp harvest hawk hazel head heart hedge helmet hero heron hill hippo hobby honey hood hook hope horizon horn
horse hotel house humor hut icon idea igloo image inch index ink input insect iris iron island item ivory jacket
jaguar jam jar jazz jeans jelly jewel jigsaw jockey joke journal joy judge juice jungle junior kale kayak kettle key
kite kitten kiwi knee knight knot koala label lace ladder lake lamb lamp lane laptop larch laser latch lava lawn layer
leaf lemon lens leopard letter level lever library lilac lily lime linen lion liquid list lizard llama lobster locket
lodge logic lotus lounge lumber lunar lunch machine magic magnet mango maple marble market mask meadow medal melody
melon member menu meteor method metro middle mile milk mill mint minute mirror mitten model monkey month moon moose
mosaic moss motor mouse mouth movie muffin mule museum music mustard nail napkin narrow nature navy nectar needle nest
nickel night ninja noble noodle north nose note novel number nurse oak oasis ocean octave octopus office olive omega
onion opera orange orbit orchid order organ otter outfit oval oven owl oxygen oyster paddle page paint palace palm
panda panel panther paper parade parcel park parrot party pasta pastel patch path peach peak peanut pear pearl pebble
pecan pedal pelican pencil penguin pepper piano pickle picnic pier pigeon pillow pilot pine pink pipe pirate pixel
pizza planet plant plate plaza plum pocket poem polar pond pony poppy porch portal potato powder prairie prism puffin
pumpkin pupil puppy puzzle pyramid quail quartz queen quest quiet quill quilt quiz rabbit raccoon radar radio raft
rain rainbow raisin rally ranch raven recipe reef relay remote rhino ribbon rice ridge ring ripple river road robin
robot rocket rodeo roof room rope rose ruby rudder ruler saddle safari sage sail salad salmon salt sand sandal satin
sauce sausage scarf school scooter scout seal season seed shadow shark shell shelter shield ship shirt shoe shore
shovel shrimp signal silk silver singer siren sketch slope smile snack snail snow soap soccer sock sofa solar soup
spark sparrow spider spice spinach spiral sponge spoon spring sprout spruce square squid stable stadium stage stamp
star statue steam steel stem stone stool storm story stove straw stream street studio sugar suit summer sunset surf
swan sweater swing syrup table tablet taco tail talent tango tank teacher temple tennis tent thistle thunder ticket
tide tiger timber toast toffee tomato tooth topaz torch tornado tortoise tower town track tractor trail train travel
tree trend tribe trophy truck trumpet tulip tuna tunnel turkey turtle tutor twig umbrella uncle unicorn union unit
upper urban valley valve vanilla vapor vase velvet vessel vest video village violet violin visor vista vivid voice
volcano voyage waffle wagon walnut walrus wand water wave weasel weather wheat wheel whale whisper whistle willow wind
window wing winter wizard wolf wombat wonder wood wool wren yacht yard yarn year yellow yeti yoga yogurt yolk zebra
zenith zero zigzag zinc zipper zone agile bold brisk busy clever cozy curly daring dizzy dusty easy fancy fast fluffy
fond fuzzy gentle giddy glad grand happy hasty hearty humble jolly keen kind lively loyal lucky mellow merry mighty
misty modest neat nimble noisy plain plucky polite proud quick rapid ready rosy royal rusty salty sandy shiny silly
sleek sleepy slim smart smooth snowy soft sunny super sweet swift tall tame tidy tiny tough tricky upbeat vast warm
wavy wild windy wise witty young zany zesty bake bend blow boil carry catch chase cheer chop cook crawl dig dive draw
drive fetch fold gather glide grow hike hop hum hunt jog juggle jump knit laugh lift march mix nap play race read ride
roam roar row run sew shine sing skate skip sleep slide sniff spin sprint swim talk throw tickle twist wander whisk
wink write yawn acre aloe anchor angel apex arch ash aura bay beet bison blaze bloom brass brine bronze cameo canopy
cargo carol cashew chime cinder clove cobalt comb cork crest dahlia dew dingo dome drone dove elk fable fawn fiddle
fjord flint fresco frost garnet geyser glacier gnome goblin granite grotto hamlet harbor haven hazel heath holly
honey husky indigo jade jasper juniper kernel kiln lagoon lantern lark laurel lemur lilac linen lynx mango manor
marsh meadow mesa mica mink moat nebula nutmeg oasis ochre olive onyx opal orca osprey pansy papaya parsley pecan
petal pewter plume poplar pretzel quince raven reed rhubarb ripple saffron salsa scone sequin sierra slate sorrel
spindle sprig summit tabby tamale tapir thyme topaz trellis tundra turnip velvet walnut wasabi willow yew zephyr
`;

export const WORDS: readonly string[] = [...new Set(LIST.trim().split(/\s+/))];
