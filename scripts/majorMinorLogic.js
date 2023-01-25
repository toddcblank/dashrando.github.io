//-----------------------------------------------------------------
// Class representing an item location for Major / Minor logic.
//-----------------------------------------------------------------

class Node {
   constructor(location, isMajor, available) {
      this.location = location;
      this.isMajor = isMajor;
      this.sortWeight = 0;
      this.available = available;
      this.item = undefined;
   }
   GetWeight() {
      if (this.location.area == Area.LowerNorfair) {
         return 11;
      } else if (this.location.area == Area.WreckedShip) {
         return 12;
      }
      return 0;
   }
   SetItem(item) {
      this.item = item;
   }
}

//-----------------------------------------------------------------
// Class to randomize items using Major / Minor logic.
//-----------------------------------------------------------------

class MajorMinorLogic {
   nodes = [];

   constructor(seed, nodes) {
      this.seed = seed;
      this.nodes = nodes;
   }

   getSeedData() {
      let seedData = new Uint8Array(104);

      const rnd = new DotNetRandom(this.seed);
      const seedInfo1 = rnd.Next(0xffff);
      const seedInfo2 = rnd.Next(0xffff);

      seedData[0] = seedInfo1 & 0xff;
      seedData[1] = (seedInfo1 >> 8) & 0xff;
      seedData[2] = seedInfo2 & 0xff;
      seedData[3] = (seedInfo2 >> 8) & 0xff;

      for (let i = 0; i < locations.length; i++) {
         const node = this.nodes.find((n) => n.location == locations[i]);
         seedData[4 + i] = node.item.id;
      }

      return seedData;
   }

   isMajor(item) {
      return item.id < 19;
   }

   isProgression(item) {
      switch (item.id) {
         case 3:
         case 6:
         case 15:
         case 18:
         case 19:
         case 20:
         case 21:
            return false;
         default:
            return true;
      }
   }

   canPlaceAtLocation(item, node) {
      if (node.item != undefined) {
         return false;
      }
      if (this.isMajor(item) != node.isMajor) {
         return false;
      }
      const notFirstThree = (node) => {
         const name = node.location.name;
         return (
            name != "Morphing Ball" &&
            name != "Beta Missiles" &&
            name != "Energy Tank, Brinstar Ceiling"
         );
      };
      const area = node.location.area;
      if (item.name == "Gravity Suit") {
         if (area == Area.Crateria) {
            return false;
         }
         return notFirstThree(node);
      } else if (item.name == "Varia Suit") {
         if (area == Area.LowerNorfair || area == Area.Crateria) {
            return false;
         }
         return notFirstThree(node);
      } else if (item.name == "Speed Booster") {
         return notFirstThree(node);
      } else if (item.name == "Screw Attack") {
         return notFirstThree(node);
      }
      return true;
   }

   //-----------------------------------------------------------------
   // Method that places all items in random locations.
   //-----------------------------------------------------------------

   placeItems(itemPool) {
      const rnd = new DotNetRandom(this.seed);

      //-----------------------------------------------------------------
      // Routine used to place the early progression items.
      //-----------------------------------------------------------------

      let prefillLoadout = new Loadout();

      let prefill = (name) => {
         const itemIndex = itemPool.findIndex((i) => i.name == name);
         const item = itemPool.splice(itemIndex, 1)[0];

         const available = this.nodes.filter(
            (n) =>
               n.available(prefillLoadout) && this.canPlaceAtLocation(item, n)
         );

         const index = rnd.Next(available.length);
         available[index].SetItem(item);
         prefillLoadout.add(item.name);
      };

      //-----------------------------------------------------------------
      // Prefill locations with early items.
      //-----------------------------------------------------------------

      prefill("Morph Ball");

      if (rnd.Next(100) < 65) {
         prefill("Missile");
      } else {
         prefill("Super Missile");
      }

      switch (rnd.Next(13)) {
         case 0:
            prefill("Speed Booster");
            break;
         case 1:
         case 2:
            prefill("Screw Attack");
            break;
         case 3:
         case 4:
         case 5:
         case 6:
            prefill("Bomb");
            break;
         default:
            prefill("Power Bomb");
            break;
      }

      if (prefillLoadout.superPacks < 1) {
         prefill("Super Missile");
      }

      if (prefillLoadout.powerPacks < 1) {
         prefill("Power Bomb");
      }

      //-----------------------------------------------------------------
      // Utility routines for shuffling arrays.
      //-----------------------------------------------------------------

      const swap = (arr, x, y) => {
         const tmp = arr[x];
         arr[x] = arr[y];
         arr[y] = tmp;
      };

      const shuffle = (arr) => {
         for (let i = 0; i < arr.length; i++) {
            swap(arr, i, rnd.NextInRange(i, arr.length));
         }
      };

      //-----------------------------------------------------------------
      // Shuffle major locations.
      //-----------------------------------------------------------------

      let shuffledLocations = this.nodes.filter((n) => n.isMajor);
      shuffle(shuffledLocations);

      //-----------------------------------------------------------------
      // Give extra weighting to certain areas.
      //-----------------------------------------------------------------

      let num = 100;
      shuffledLocations.forEach((n) => {
         n.sortWeight = num - n.GetWeight();
         num += 10;
      });

      shuffledLocations.sort((a, b) => {
         return a.sortWeight - b.sortWeight;
      });

      //-----------------------------------------------------------------
      // Shuffle items.
      //-----------------------------------------------------------------

      let shuffledItems = itemPool;
      shuffle(shuffledItems);

      //-----------------------------------------------------------------
      // Move a random suit to the front of the list to be placed first.
      //-----------------------------------------------------------------

      const firstSuit = rnd.Next(2) == 0 ? "Varia Suit" : "Gravity Suit";
      const suitIndex = shuffledItems.findIndex((i) => i.name == firstSuit);
      shuffledItems.unshift(shuffledItems.splice(suitIndex, 1)[0]);

      //-----------------------------------------------------------------
      // Routine that computes the assumed loadout that will be
      // available given the prefilled items and the remaining
      // shuffled items. Used when placing progression items.
      //-----------------------------------------------------------------

      const getAssumedLoadout = () => {
         let itemLocations = this.nodes.filter((n) => n.item != undefined);

         let assumedLoadout = prefillLoadout.clone();
         shuffledItems.forEach((i) => assumedLoadout.add(i.name));

         let accessibleNodes = itemLocations.filter((n) => {
            return n.available(assumedLoadout);
         });

         accessibleNodes.forEach((n) => assumedLoadout.add(n.item.name));
         return assumedLoadout;
      };

      //-----------------------------------------------------------------
      // Place progression items.
      //-----------------------------------------------------------------

      let firstProgression;
      while (
         0 <=
         (firstProgression = shuffledItems.findIndex((p) =>
            this.isProgression(p)
         ))
      ) {
         let item = shuffledItems.splice(firstProgression, 1)[0];

         const assumedLoadout = getAssumedLoadout();

         let firstLocation = shuffledLocations.find(
            (n) =>
               n.available(assumedLoadout) && this.canPlaceAtLocation(item, n)
         );
         firstLocation.SetItem(item);
      }

      //-----------------------------------------------------------------
      // Place the rest of the items in the pool.
      //-----------------------------------------------------------------

      const getCurrentLoadout = () => {
         let current = new Loadout();
         this.nodes.forEach((n) => {
            if (n.item != undefined) {
               current.add(n.item.name);
            }
         });
         return current;
      };

      const getAvailableLocations = (load) => {
         return this.nodes.filter(
            (n) => n.item == undefined && n.available(load)
         );
      };

      const checkItem = (item) => {
         let current = getCurrentLoadout();
         let oldLocations = getAvailableLocations(current);

         if (!oldLocations.some((n) => this.canPlaceAtLocation(item, n))) {
            return false;
         }

         current.add(item.name);
         let newLocations = getAvailableLocations(current);

         if (newLocations.length <= oldLocations.length) {
            return false;
         }

         return newLocations.some((n) => n.isMajor);
      };

      const getPossibleItems = () => {
         return itemPool.filter((i) => checkItem(i));
      };

      const placeItem = () => {
         let possibleItems = getPossibleItems();

         const selectItem = () => {
            if (possibleItems.length == 0) {
               return itemPool[rnd.Next(itemPool.length)];
            }
            return possibleItems[rnd.Next(possibleItems.length)];
         };

         let item = selectItem();
         let availableLocations = getAvailableLocations(
            getCurrentLoadout()
         ).filter((n) => this.canPlaceAtLocation(item, n));

         const locationIndex = rnd.Next(availableLocations.length);
         availableLocations[locationIndex].SetItem(item);
         return item;
      };

      while (itemPool.length > 0) {
         const item = placeItem();
         const itemIndex = itemPool.findIndex((i) => i == item);
         itemPool.splice(itemIndex, 1);
      }

      return this.getSeedData();
   }
}
