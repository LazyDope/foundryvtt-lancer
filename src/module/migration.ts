// @ts-nocheck
// We do not care about this file being super rigorous
import { LANCER } from "./config";
import { handleActorExport } from "./helpers/io";
import { LancerActor } from "./actor/lancer-actor";
import { core_update, LCPIndex, LCPManager, updateCore } from "./apps/lcpManager";
import { EntryType, NpcClass, NpcFeature, NpcTemplate, OpCtx } from "machine-mind";
import { LancerItem } from "./item/lancer-item";
import { FoundryReg } from "./mm-util/foundry-reg";
import { RegRef } from "machine-mind/dist/registry";

let lp = LANCER.log_prefix;

/**
 * Perform a system migration for the entire World, applying migrations for Actors, Items, and Compendium packs
 * @return {Promise}      A Promise which resolves once the migration is completed
 */
export const migrateWorld = async function (migrateComps = true, migrateActors = false) {
  ui.notifications.info(
    `Applying LANCER System Migration for version ${game.system.data.version}. Please be patient and do not close your game or shut down your server.`,
    { permanent: true }
  );

  // Migrate World Compendium Packs
  if (migrateComps) {
    await scorchedEarthCompendiums();
    await updateCore(core_update);

    if ((await game.settings.get(LANCER.sys_name, LANCER.setting_core_data)) === core_update) {
      // Open the LCP manager for convenience.
      new LCPManager().render(true);

      // Compendium migration succeeded, prompt to migrate actors.
      new Dialog({
        title: `Migrate Actors`,
        content: `
<p>Lancer compendiums have been successfully migrated to core version ${core_update}.</p>
<p>Next, you need to import all of the LCPs that your pilots and NPCs require. You must use current, up-to-date
LCP compatible with Comp/Con.</p>
<p>Once that is complete, click the button below to start migrating all of your actors. If you want 
to close this window while working on your LCPs, you can start migrating your actors by clicking 
the button in the Compendium tab.</p>`,
        buttons: {
          accept: {
            label: "Start Migration",
            callback: async () => {
              await migrateAllActors();
            },
          },
          cancel: {
            label: "Close",
          },
        },
        default: "cancel",
      }).render(true);
    } else {
      // Compendium migration failed.
      new Dialog({
        title: `Compendium Migration Failed`,
        content: `
<p>Something went wrong while attempting to build the core data Compendiums for the new Lancer system.
Please refresh the page to try again.</p>`,
        buttons: {
          accept: {
            label: "Refresh",
            callback: async () => {
              ui.notifications.info("Page reloading in 3...");
              await sleep(1000);
              ui.notifications.info("2...");
              await sleep(1000);
              ui.notifications.info("1...");
              await sleep(1000);
              window.location.reload(false);
            },
          },
          cancel: {
            label: "Close",
          },
        },
        default: "accept",
      }).render(true);
    }

    // for (let p of game.packs) {
    //   if (p.metadata.package === "world" && ["Actor", "Item", "Scene"].includes(p.metadata.entity)) {
    //     await migrateCompendium(p);
    //   }
    // }
  }

  // Migrate World Actors
  // NEVERMIND, GMs gotta update LCPs first.
  // const dataVersion = game.settings.get(LANCER.sys_name, LANCER.setting_core_data);
  // if (migrateActors && compareVersions(dataVersion, "3.0.0") > 0) {
  //   await migrateAllActors();
  // } else {
  //   ui.notifications.warn(
  //     "Actor migration paused due to old Core Data. Please update your compendiums and manually trigger migration."
  //   );
  // }

  // // Migrate World Items
  // for (let i of game.items.entities) {
  //   try {
  //     const updateData = migrateItemData(i);
  //     if (!isObjectEmpty(updateData)) {
  //       console.log(`Migrating Item entity ${i.name}`);
  //       await i.update(updateData, { enforceTypes: false });
  //     }
  //   } catch (err) {
  //     console.error(err);
  //   }
  // }

  // // Migrate Actor Override Tokens
  // for (let s of game.scenes.entities) {
  //   try {
  //     const updateData = migrateSceneData(s);
  //     if (updateData && !isObjectEmpty(updateData)) {
  //       console.log(`Migrating Scene entity ${s.name}`);
  //       await s.update(updateData, { enforceTypes: false });
  //     }
  //   } catch (err) {
  //     console.error(err);
  //   }
  // }

  // Set the migration as complete
  // await game.settings.set(LANCER.sys_name, LANCER.setting_migration, game.system.data.version);
  ui.notifications.info(`LANCER System Migration to version ${game.system.data.version} completed!`, {
    permanent: true,
  });
};

/* -------------------------------------------- */

const compTitles = {
  old: [
    "Skill Triggers",
    "Talents",
    "Core Bonuses",
    "Pilot Armor",
    "Pilot Weapons",
    "Pilot Gear",
    "Frames",
    "Systems",
    "Weapons",
    "NPC Classes",
    "NPC Templates",
    "NPC Features",
  ],
  new: {
    Actor: ["Deployable"],
    Item: [
      "Core Bonus",
      "Environment",
      "Frame",
      "License",
      "Manufacturer",
      "Mech System",
      "Mech Weapon",
      "Pilot Armor",
      "Pilot Gear",
      "Reserve",
      "Sitrep",
      "Skill",
      "Status/Condition",
      "Tag",
      "Talent",
      "Weapon Mod",
    ],
  },
};

export const migrateAllActors = async () => {
  let count = 0;
  for (let a of game.actors.values()) {
    try {
      if (a.data.type === "pilot") {
        const ret = handleActorExport(a, false);
        if (ret) {
          console.log(`== Migrating Actor entity ${a.name}`);
          await (a as LancerActor).importCC(ret, true);
          console.log(ret);
          count++;
        }
      } else if (a.data.type === "npc") {
        await (a.items as [LancerItem]).forEach(item => {
          item.update(migrateItemData(item));
        });
      }
    } catch (err) {
      console.error(err);
      console.error(`== Migrating Actor entity ${a.name} failed.`);
    }
  }
  ui.notifications.info(`Migrations triggered: ${count}`);
};

export const scorchedEarthCompendiums = async () => {
  // Remove all packs.
  for (let comp of game.packs.filter(comp => compTitles.old.includes(comp.title))) {
    await comp.configure({ locked: false });
    await comp.deleteCompendium();
    console.log(`Deleting ${comp.title}`);
  }
  // Build blank ones.
  for (let type in compTitles.new) {
    for (let title of compTitles.new[type]) {
      const id = title.toLocaleLowerCase().replace(" ", "_").split("/")[0];
      if (!game.packs.has(`world.${id}`)) {
        await CompendiumCollection.createCompendium({
          name: id,
          label: title,
          path: `packs/${id}.db`,
          private: false,
          entity: type,
          system: "lancer",
          package: "world",
        });
      }
    }
  }

  await game.settings.set(LANCER.sys_name, LANCER.setting_core_data, "0.0.0");
  await game.settings.set(LANCER.sys_name, LANCER.setting_lcps, new LCPIndex(null));
};

/**
 * Apply migration rules to all Entities within a single Compendium pack
 * @param pack
 * @return {Promise}
 */
export const migrateCompendium = async function (pack: Compendium) {
  const wasLocked = pack.locked;
  await pack.configure({ locked: false });
  if (pack.locked) return ui.notifications.error(`Could not migrate ${pack.collection} as it is locked.`);
  const entity = pack.metadata.entity;
  if (!["Actor", "Item", "Scene"].includes(entity)) return;

  // Begin by requesting server-side data model migration and get the migrated content
  try {
    await pack.migrate({});
  } catch (err) {
    console.error(err);
  }

  const content = await pack.getDocuments();

  // Iterate over compendium entries - applying fine-tuned migration functions
  for (let ent of content) {
    try {
      let updateData = null;
      if (entity === "Item") updateData = migrateItemData(ent as Item);
      else if (entity === "Actor") updateData = migrateActorData(ent as Actor);
      else if (entity === "Scene") updateData = migrateSceneData(ent.data);
      if (!isObjectEmpty(updateData)) {
        expandObject(updateData);
        updateData["_id"] = ent._id;
        await pack.updateEntity(updateData);
        console.log(`Migrated ${entity} entity ${ent.name} in Compendium ${pack.collection}`);
      }
    } catch (err) {
      console.error(err);
    }
  }
  await pack.configure({ locked: wasLocked });
  console.log(`Migrated all ${entity} entities from Compendium ${pack.collection}`);
};

/* -------------------------------------------- */
/*  Entity Type Migration Helpers               */
/* -------------------------------------------- */

/**
 * Migrate a single Actor entity to incorporate latest data model changes
 * Return an Object of updateData to be applied
 * @param {Actor} actor   The actor to Update
 * @return {Object}       The updateData to apply
 */
export const migrateActorData = function (actor: Actor) {
  const updateData: any = {};
  const ad: ActorData = actor.data;

  // Insert code to migrate actor data model here

  // Migrate Owned Items
  if (!actor.items) return updateData;
  let hasItemUpdates = false;
  const items = actor.items.map(i => {
    // Migrate the Owned Item
    let itemUpdate = migrateItemData(i);

    // Update the Owned Item
    if (!isObjectEmpty(itemUpdate)) {
      hasItemUpdates = true;
      return mergeObject(i, itemUpdate, { enforceTypes: false, inplace: false });
    } else return i;
  });
  if (hasItemUpdates) updateData.items = items;

  // Remove deprecated fields
  _migrateRemoveDeprecated(actor, updateData);

  return updateData;
};

/* -------------------------------------------- */

/**
 * Scrub an Actor's system data, removing all keys which are not explicitly defined in the system template
 * @param {ActorData} actorData    The data object for an Actor
 * @return {ActorData}             The scrubbed Actor data
 */
function cleanActorData(actorData: ActorData) {
  // Scrub system data
  const model = game.system.model.Actor[actorData.type];
  actorData.data = filterObject(actorData.data, model);

  // Scrub system flags
  const allowedFlags = CONFIG.LANCER.allowedActorFlags.reduce((obj, f) => {
    obj[f] = null;
    return obj;
  }, {});
  if (actorData.flags.dnd5e) {
    actorData.flags.dnd5e = filterObject(actorData.flags.dnd5e, allowedFlags);
  }

  // Return the scrubbed data
  return actorData;
}

/* -------------------------------------------- */

/**
 * Migrate a single Item entity to incorporate latest data model changes
 * @param item
 */
export const migrateItemData = function (item: LancerItem<NpcClass | NpcTemplate | NpcFeature>) {
  const origData = item.data;
  const updateData = duplicate(origData);

  switch (origData.type) {
    case EntryType.NPC_CLASS:
      console.log(`${lp} Migrating NPC class`, item);
      break;
    case EntryType.NPC_TEMPLATE:
      console.log(`${lp} Migrating NPC template`, item);
      break;
    case EntryType.NPC_FEATURE:
      console.log(`${lp} Migrating NPC feature`, item);
      updateData.data.lid = origData.data.id;
      updateData.data.loaded = true;
      updateData.data.type = origData.data.feature_type;
      updateData.data.origin = {
        origin: origData.data.origin_name,
        base: origData.data.origin_base,
        type: origData.data.origin_type,
      };
      updateData.data.tier_override = 0;
      // Transform damage. Old format is array of damage types, each type has an Array[3] of vals.
      // New format is an Array[3] of damage types per tier. Each damage type follows normal {type, val} spec.
      updateData.data.damage = [[], [], []];
      origData.data.damage.forEach((oldDamage: { type: str; val: [str | int] }) => {
        if (oldDamage.val && Array.isArray(oldDamage.val)) {
          for (let i = 0; i < Math.min(3, oldDamage.val.length); i++) {
            updateData.data.damage[i].push({ type: oldDamage.type, val: oldDamage.val[i] });
          }
        }
      });
      // Migrate & relink tags;
      updateData.data.tags = [];
      if (origData.data.tags && Array.isArray(origData.data.tags)) {
        // let cat = new FoundryReg({
        //   item_source: "compendium|compendium",
        // }).get_cat(EntryType.TAG);
        origData.data.tags.forEach(async tag => {
          let newTag: RegRef<EntryType.TAG> = {
            fallback_lid: tag.id,
          };
          updateData.data.tags.push(newTag);
        });
      }

      // Remove deprecated fields
      updateData.data.id = undefined;
      updateData.data.feature_type = undefined;
      updateData.data.max_uses = undefined;
      // Keep these ones if they have anything in them, just in case.
      if (updateData.data.flavor_description === "") {
        updateData.data.flavor_description = undefined;
      }
      if (updateData.data.flavor_name === "") {
        updateData.data.flavor_name = undefined;
      }
      if (updateData.data.note === "") {
        updateData.data.note = undefined;
      }

      break;
  }

  // Remove deprecated fields
  _migrateRemoveDeprecated(item, updateData);

  // Return the migrated update data
  return updateData;
};

/* -------------------------------------------- */

/**
 * Migrate a single Scene entity to incorporate changes to the data model of it's actor data overrides
 * Return an Object of updateData to be applied
 * @param {Object} scene  The Scene data to Update
 * @return {Object}       The updateData to apply
 */
export const migrateSceneData = function (scene) {
  if (!scene.tokens) return;
  const tokens = duplicate(scene.tokens);
  return {
    tokens: tokens.map(t => {
      if (!t.actorId || t.actorLink || !t.actorData.data) {
        t.actorData = {};
        return t;
      }
      const token = new Token(t);
      if (!token.actor) {
        t.actorId = null;
        t.actorData = {};
      } else if (!t.actorLink) {
        const updateData = migrateActorData(token.data.actorData);
        t.actorData = mergeObject(token.data.actorData, updateData);
      }
      return t;
    }),
  };
};

/* -------------------------------------------- */

/**
 * A general migration to remove all fields from the data model which are flagged with a _deprecated tag
 * @private
 */
const _migrateRemoveDeprecated = function (ent, updateData) {
  const flat = flattenObject(ent.data);

  // Identify objects to deprecate
  const toDeprecate = Object.entries(flat)
    .filter(e => e[0].endsWith("_deprecated") && e[1] === true)
    .map(e => {
      let parent = e[0].split(".");
      parent.pop();
      return parent.join(".");
    });

  // Remove them
  for (let k of toDeprecate) {
    let parts = k.split(".");
    parts[parts.length - 1] = "-=" + parts[parts.length - 1];
    updateData[`data.${parts.join(".")}`] = null;
  }
};
