# Area Status card

![Area Status card showing the Kitchen name and live indicators in one row](images/area-status.png)

Add **Area Status** from **Info** in the card chooser. Select a Home Assistant area to show its name and live indicators in one horizontal row, for example at the top of a room view. On narrow cards the indicators scroll sideways.

Automatic indicators start with lights and covers, followed by temperature, humidity, illuminance, window and door contacts, motion/occupancy/presence, and smoke. Area membership follows the entity's assigned area or its device's area. Hidden or disabled entities are omitted, including manual selections and members of nested groups.

Each indicator can be hidden, removed, reordered by dragging or the up/down buttons, given a label or icon, and configured with selected or excluded entities. **Add individual sensor** also accepts any sensor or binary sensor. An explicit title and manual selections work without an area.

Temperature, humidity and illuminance show one available reading; a manual selection takes precedence. Readings with different units are never averaged. Lights and covers deduplicate nested groups. Covers report open and moving counts. Missing readings and partial counts explicitly show unavailable entities.

Tap an indicator to see its member states, then tap a member for Panalume's existing entity popup. The card uses the existing live entity subscription, shares registry reads between instances, and refreshes after registry changes and reconnects. It does not poll or call device services.

## Validation

From `panalume/app`, run `node --test tests/area-status.test.js` and `npm run build`.
