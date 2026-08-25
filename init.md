I want to create a turn-based strategy game that happens on a square grid, which can be of various sizes depending on game set up (e.g. 10 x 10). Each turn, a user receives a resource (requiring choice), and also has an action: they could either create a unit, move a unit, or attack a unit. A resource could be food, wood, or stone. Each unit has different resource costs. You have footsoldiers, which is cheap, but has a limited attack range, movement range, HP, and attack points. You also have a cannon, which has a high attack range, average HP, high attack points, but is expensive to build. Then let's also add cavalry, which exhibits the expected characteristics: huge movement range, decent attack points, but more expensive than a pikeman. On the first turn, the players set up a base in their area of choice, where the base has a set number of HP, and once it is destroyed, the game is lost by the player. The fun part is that you can have up to four players, one player on each side. We can also of course vary the terrain/maps by adding obstacles that cannot be crossed, like a lake or a mountain, and maybe add special conditions that only certain units can cross a lake, or their movement range reduces. 

Firstly, I've only got a rough conception of this game in my head (we used to play this on paper at school), so we will need a more elaborate plan built out for this. Secondly, I will need recommendations on the best way to implement this in terms of tech stack. We may need to do a lengthy prompt mode session to gather all the necessary inputs, which I'm more than happy to. 

=========================================================

I think we need to add a rule so that users must collect income each turn, otherwise they cannot proceed. We are also critically missing visual assets and elements - food, wood, stone, all the units, and then the mountains and the lakes. It would also look nice to have the two players' resource counters at the bottom as two little cards, so that it is easier to see. 

=========================================================

There are a few things which I think we can improve. First, the assets are pretty basic icons right now. Is there any way we can generate some nicer ones? Second, I think there are quite a few UI/UX bugs. As a game UI/UX designer, can we do a full review to identify bugs to fix? For instance, the 'Unit reference' card has the 'Cost' values wrapped into two rows, which make it hard to read. Thirdly, another bug is that in 'Confirm income', you cannot actually see what you have selected, so that 'Confirm' button is actually a bit moot, since you can't go back and re-select anyway. Fourthly, I would also add an initial step so that the users can select their base in the map, rather than have it provided by default. Fifthly, I think we can add a new feature, which is 'Resources', such that if you send a troop to capture them, you can have bonus resources. 

=========================================================

There appears to be a few bugs. 
* A unit can't seem to go between two obstacle units diagonally, which I'm not sure if it's an expected behaviour. 
* Can we also make sure that you can capture someone else's resource, if it is always generating resource? If all units have used up their valid move and attack turns, we should also put a note to notify the player. 
* Related to that, we should have the unit greyed out if they've used out their move and/or attack turns. We also need a clear indicator that a player has captured a node. Maybe a scoreboard at the bottom to mark how many resource nodes are captured? 
* There's also a UX thing where it's not clear to a user whether they have used up their turn to build a unit, and it makes it easy to forget and 'start actions', therefore missing the turn to build a unit. What's a good way to notify the user?
* We should also have somewhere a stats table - perhaps separately clicked on, to count how many units destroyed, were destroyed, created, etc. It might be excessive, but a timeline of population and economy would be really fun. 
* I think units can be allowed to 'heal' one HP at a time if within some proximity of the base. 
* There appears to be a bug because the enemy base can't seem to be 'attacked'. I could send units there, but the attacking doesn't happen. 
* Instead of having too many individual lakes, it would be cool to have them occupy multiple adjacent grids so that they form a 'big lake'. 
* I think archers could be a nice new unit that is cheap but has long range. 
Asides from the above, we can also plan the icon generation and the broader UX review pass. 

=========================================================

* With the 'stats' and the line graph, we actually want to compare players against each other, not for each player, their own population against economy (not helpful).
* We should also have a settings page to choose things like number of players, map size, number of free resource to capture, difficulty, etc. 
* For adding units, I wonder if we can make it a drag and drop effect? That way, placement would feel a lot more real. 
* Can we have healing and damage animations when they happen? 
* After a player wins the game, there should be a more obvious winning animation, or to open up the stats page to review. 
* I think it will be good to be able to build road/bridges which costs like one unit of wood. The effect of this is that it will speed up movement range by one, and allow troops to cross the lake. 
* Instead of generating random maps, we should have maps that contain themes (that we select at the start). You can have a river map where there is a large river running across the map, or a hilly terrain where navigation is slow and challenging, and also an oasis one where all the resources are in one place in the middle that all players will want to capture. 
* I actually also find the current icons very small and hard to see what they are. 
* The 'Cost' column again is wrapping the text and turning it into two rows, making it hard to read. 

=========================================================

The game is looking good now, although I have several pieces of feedback. For the 'Stats' page, I think we can do with more pages, as I think it's important that we have more information about the battles (this is afterall, a strategy game). I think 'Buildings razed' is a good statistic. Also, I'd like to see a little indicator 'X' mark on the line charts for when a player has been eliminated from the game. We can split this into two pages (can take suggestions) because we have quite a lot on now. In terms of gameplay, I'd like to relax the rules of 3 tiles for when I am building a new settlement - I think it's too strict. We probably can allow building a settlement anywhere, as I don't see a point in adding a rule limit. Also, I think the Hero unit is still not doing any splash damage at the moment, so it only just deducts hitpoints from the unit it directly attacks. So that's a bug that needs fixing. Asides from unit guide, I think we should also have the builder's build guide somewhere in there as well, as a player might choose to save up resources to build vis-a-vis the builder, rather than create units directly. Furthermore, I think we should allow buildings that are connected by road to the base to self-repair automatically. 

=========================================================

Great. I've got a few pieces of extra feedback after the most recent gameplay, using the isometric mode. There's quite a lot of feedback so we can consider using an orchestrator-agent approach. Go into prompt mode if specific user input is required from me. 


1. I don't think the '+1 chosen' is necessary to add to occupy space in the resource cards. Happy for that to be removed. Overall, I also think the player resource cards at the bottom can be optimised in terms of real estate, perhaps by only showing the resource icons once, and then the 'current available' and 'income/turn' numbers on two rows. Let's have a think about how the design should look. 
2. There's quite a big gap/space between the gameboard and the player cards at the bottom. This requires the player to scroll back and forth to see the values. Can we fix this issue? 
3. I think it would be good to fix the resource nodes as well, so that they have a consistent style to the other units. 
4. In the isometric mode, can we also update the side panel graphics so that they match what it looks like in the actual gameplay? At the moment, the side panel show the older pixel 2d versions, whilst the isometric gameplay shows the 2.5d newer pixel versions. 
5. I noticed that the mountains actually look transparent at the base - this is weird looking and doesn't quite make sense. They should be more opaque. 
6. I noticed that the hero unit still doesn't do splash attacks properly. Can we fix this bug? The expected behaviour is that once a hero arrives to a new cell, it should automatically launch the attack on all surrounding enemy units, without requiring a user 'click' to attack. 
7. The 'stats' card is looking quite cramped. I think the way to fix is to ensure the data we show on the two pages are mutually exclusive - no need to repeat the battle starts on both pages. Alongside this, I can also see that the 'cross' sign on an eliminated player does not align well with the vertical dotted line, and I would have expected the vertical dotted line to be colour-coordinated with the eliminated player. 
8. On the 'Choose what to build:' page, I would expect the cards to be greyed out if there aren't enough resources to build the specific unit. Currently, everything lights up as if everything is affordable. 

===

1. The player cards still continue to stick to the bottom of the screen, causing a force-scroll. This surfaces especially in the 'Choose what to build' screen, where I believe the sidepanel menu expands, causing the page to lengthen. How can we fix this?
2. On the 'Choose what to build' screen, the icons in the isometric 2.5d gameplay is still showing as the old graphics. Similarly, these apply to the Builder's menu, in the card which says 'Move or attack with your units'. Can we update these too? 
3. Can we find matching art-style icons for food, wood, and stone where it appears?
4. I'd like to make isometric 2.5d view the default game mode, rather than classic pixel. However, we'll need a better name than 'isometric 2.5d', so please provide some suggestions. 
5. For some reason, in grids that are under the fog of war, I get blue, grey, and green grids. That isn't what I expect, because if there's a fog of war, there's uncertainty about the terrain too. IMO, they should all be grey if they're not in line of sight and unexplored. 
6. In the 'Choose what to build' screen, when a unit is selected, the cursor becomes the unit. This is nice effect that I really like. Unfortunately, once the cursor goes over to the grid, the unit transforms back to the standard/default mouse cursor. Can we fix this?
7. In the isometric mode, bridges are invisible. Can we fix this - I suppose this needs a new graphic to be created? 
8. Also, when roads are built, they now turn the land from green to red. It's not the best visual, if I'm honest. What are some better alternatives? 
Again, use prompt mode if input is required from me. 